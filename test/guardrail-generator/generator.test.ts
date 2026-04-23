import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { LoadedBinding } from "../../src/config/binding-loader.js";
import type { ResolvedConfig } from "../../src/config/types.js";
import { generateGuardrails } from "../../src/guardrail-generator/generator.js";
import {
  DslSchema,
  type Dsl,
  type SoftwareBinding,
} from "../../src/schema/index.js";

const createdDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    createdDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })),
  );
});

async function newConfigDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "agc-gr-"));
  createdDirs.push(dir);
  return dir;
}

function minimalDsl(overrides: Partial<Record<string, unknown>> = {}): Dsl {
  const raw = {
    version: 1,
    system: {
      id: "sys",
      name: "System",
      default_workflow_order: [],
    },
    guardrails: {
      gr1: {
        description: "Guardrail one",
        scope: {},
      },
    },
    guardrail_policies: {
      default: {
        description: "Default",
        rules: [
          {
            guardrail: "gr1",
            severity: "mandatory",
            action: "warn",
          },
        ],
      },
    },
    ...overrides,
  };
  return DslSchema.parse(raw);
}

function baseResolvedConfig(
  configDir: string,
  overrides: Partial<ResolvedConfig> = {},
): ResolvedConfig {
  return {
    dsl: "dsl.yaml",
    renders: [{ template: "t", context: "system", output: "o" }],
    configDir,
    bindings: [],
    paths: { hooks: join(configDir, "hooks") },
    activeGuardrailPolicy: "default",
    ...overrides,
  };
}

function loadedBinding(
  configDir: string,
  software: string,
  binding: SoftwareBinding,
): LoadedBinding {
  return {
    filePath: join(configDir, `${software}.yaml`),
    binding,
  };
}

function bindingWithOutputs(
  configDir: string,
  software: string,
  outputs: NonNullable<SoftwareBinding["outputs"]>,
  guardrailImpl?: SoftwareBinding["guardrail_impl"],
  extras: Partial<SoftwareBinding> = {},
): LoadedBinding {
  return loadedBinding(configDir, software, {
    software,
    version: 1,
    guardrail_impl: guardrailImpl ?? {
      gr1: { checks: [{ message: "check-a" }] },
    },
    outputs,
    ...extras,
  });
}

describe("generateGuardrails diagnostics", () => {
  it("returns warning when no active_guardrail_policy", async () => {
    const configDir = await newConfigDir();
    const dsl = minimalDsl();
    const config = baseResolvedConfig(configDir, {
      activeGuardrailPolicy: undefined,
    });
    const lb = bindingWithOutputs(configDir, "app", {
      out: {
        target: "{hooks}/x.txt",
        inline_template: "x",
      },
    });

    const result = await generateGuardrails({
      dsl,
      config,
      loadedBindings: [lb],
    });

    expect(result.outputFiles).toEqual([]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        path: "config.active_guardrail_policy",
        severity: "warning",
      }),
    );
  });

  it("returns error when active policy not found in DSL", async () => {
    const configDir = await newConfigDir();
    const dsl = minimalDsl();
    const config = baseResolvedConfig(configDir, {
      activeGuardrailPolicy: "missing-policy",
    });
    const lb = bindingWithOutputs(configDir, "app", {
      out: { target: "{hooks}/x.txt", inline_template: "x" },
    });

    const result = await generateGuardrails({
      dsl,
      config,
      loadedBindings: [lb],
    });

    expect(result.outputFiles).toEqual([]);
    expect(result.diagnostics.some((d) => d.severity === "error")).toBe(true);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        path: "config.active_guardrail_policy",
        message: expect.stringContaining("missing-policy"),
        severity: "error",
      }),
    );
  });

  it("returns info for builtin: template (not yet implemented)", async () => {
    const configDir = await newConfigDir();
    const dsl = minimalDsl();
    const config = baseResolvedConfig(configDir);
    const lb = bindingWithOutputs(configDir, "app", {
      out: {
        target: "{hooks}/builtin-out.txt",
        template: "builtin:noop",
      },
    });

    const result = await generateGuardrails({
      dsl,
      config,
      loadedBindings: [lb],
    });

    expect(result.outputFiles).toEqual([]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        path: "binding.app.outputs.out",
        severity: "info",
        message: expect.stringContaining("Builtin template"),
      }),
    );
  });

  it("returns error when output has no template", async () => {
    const configDir = await newConfigDir();
    const dsl = minimalDsl();
    const config = baseResolvedConfig(configDir);
    const lb = bindingWithOutputs(configDir, "app", {
      out: { target: "{hooks}/bare.txt" },
    });

    const result = await generateGuardrails({
      dsl,
      config,
      loadedBindings: [lb],
    });

    expect(result.outputFiles).toEqual([]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        path: "binding.app.outputs.out",
        severity: "error",
        message: "Output has neither template, inline_template, nor source",
      }),
    );
  });

  it("returns error when path variable is unresolved", async () => {
    const configDir = await newConfigDir();
    const dsl = minimalDsl();
    const config = baseResolvedConfig(configDir, { paths: {} });
    const lb = bindingWithOutputs(configDir, "app", {
      out: { target: "{hooks}/x.txt", inline_template: "x" },
    });

    const result = await generateGuardrails({
      dsl,
      config,
      loadedBindings: [lb],
    });

    expect(result.outputFiles).toEqual([]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        path: "binding.app.outputs",
        severity: "error",
        message: expect.stringContaining("hooks"),
      }),
    );
  });
});

describe("generateGuardrails dryRun", () => {
  it("returns output files list but does not write files", async () => {
    const configDir = await newConfigDir();
    const hooks = join(configDir, "hooks");
    const dsl = minimalDsl();
    const config = baseResolvedConfig(configDir);
    const outPath = join(hooks, "dry.txt");
    const lb = bindingWithOutputs(configDir, "app", {
      out: {
        target: "{hooks}/dry.txt",
        inline_template: "hello",
      },
    });

    const result = await generateGuardrails({
      dsl,
      config,
      loadedBindings: [lb],
      dryRun: true,
    });

    expect(result.outputFiles).toEqual([outPath]);
    await expect(readFile(outPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("dryRun with group_by returns per-group paths", async () => {
    const configDir = await newConfigDir();
    const hooks = join(configDir, "hooks");
    const dsl = minimalDsl();
    const config = baseResolvedConfig(configDir);
    const lb = bindingWithOutputs(
      configDir,
      "app",
      {
        out: {
          target: "{hooks}/groups",
          group_by: "tier",
          inline_template: "{{current_group}}",
        },
      },
      {
        gr1: {
          checks: [
            { tier: "a", message: "m1" },
            { tier: "b", message: "m2" },
          ],
        },
      },
    );

    const result = await generateGuardrails({
      dsl,
      config,
      loadedBindings: [lb],
      dryRun: true,
    });

    const expected = [join(hooks, "groups", "a"), join(hooks, "groups", "b")];
    expect([...result.outputFiles].sort()).toEqual([...expected].sort());
    await expect(readFile(expected[0]!)).rejects.toMatchObject({ code: "ENOENT" });
  });
});

describe("generateGuardrails template rendering", () => {
  it("renders inline_template with context variables", async () => {
    const configDir = await newConfigDir();
    const dsl = minimalDsl();
    const config = baseResolvedConfig(configDir, {
      vars: { env: "test" },
    });
    const lb = bindingWithOutputs(configDir, "app", {
      out: {
        target: "{hooks}/ctx.json",
        inline_template: "{{vars.env}}\n{{json resolved_checks}}",
      },
    });

    const result = await generateGuardrails({
      dsl,
      config,
      loadedBindings: [lb],
    });

    expect(result.outputFiles.length).toBe(1);
    const body = await readFile(result.outputFiles[0]!, "utf8");
    expect(body).toContain("test");
    expect(body).toContain("check-a");
  });

  it("writes rendered output to the resolved file path", async () => {
    const configDir = await newConfigDir();
    const hooks = join(configDir, "hooks");
    const dsl = minimalDsl();
    const config = baseResolvedConfig(configDir);
    const lb = bindingWithOutputs(configDir, "app", {
      out: {
        target: "{hooks}/nested/out.txt",
        inline_template: "payload",
      },
    });

    const result = await generateGuardrails({
      dsl,
      config,
      loadedBindings: [lb],
    });

    const expected = join(hooks, "nested", "out.txt");
    expect(result.outputFiles).toEqual([expected]);
    expect(await readFile(expected, "utf8")).toBe("payload");
  });

  it("sets executable file permissions when executable is true", async () => {
    const configDir = await newConfigDir();
    const dsl = minimalDsl();
    const config = baseResolvedConfig(configDir);
    const lb = bindingWithOutputs(configDir, "app", {
      out: {
        target: "{hooks}/run.sh",
        inline_template: "#!/bin/sh\necho ok\n",
        executable: true,
      },
    });

    const result = await generateGuardrails({
      dsl,
      config,
      loadedBindings: [lb],
    });

    const out = result.outputFiles[0]!;
    const s = await stat(out);
    if (process.platform !== "win32") {
      expect(s.mode & 0o111).toBeTruthy();
    }
  });
});

describe("generateGuardrails filtering", () => {
  it("limits processed bindings when filterBindings is set", async () => {
    const configDir = await newConfigDir();
    const hooks = join(configDir, "hooks");
    const dsl = minimalDsl();
    const config = baseResolvedConfig(configDir);
    const a = bindingWithOutputs(
      configDir,
      "alpha",
      { out: { target: "{hooks}/a.txt", inline_template: "A" } },
      { gr1: { checks: [{ message: "a" }] } },
    );
    const b = bindingWithOutputs(
      configDir,
      "beta",
      { out: { target: "{hooks}/b.txt", inline_template: "B" } },
      { gr1: { checks: [{ message: "b" }] } },
    );

    const result = await generateGuardrails({
      dsl,
      config,
      loadedBindings: [a, b],
      filterBindings: ["alpha"],
    });

    expect([...result.outputFiles].sort()).toEqual([join(hooks, "a.txt")].sort());
    await expect(readFile(join(hooks, "b.txt"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("skips bindings that define no outputs", async () => {
    const configDir = await newConfigDir();
    const hooks = join(configDir, "hooks");
    const dsl = minimalDsl();
    const config = baseResolvedConfig(configDir);
    const silent = loadedBinding(configDir, "silent", {
      software: "silent",
      version: 1,
      guardrail_impl: { gr1: { checks: [{ message: "x" }] } },
    });
    const active = bindingWithOutputs(configDir, "app", {
      out: { target: "{hooks}/only.txt", inline_template: "ok" },
    });

    const result = await generateGuardrails({
      dsl,
      config,
      loadedBindings: [silent, active],
    });

    expect(result.outputFiles).toEqual([join(hooks, "only.txt")]);
  });
});

describe("generateGuardrails group_by", () => {
  it("splits checks by field and writes separate files per group", async () => {
    const configDir = await newConfigDir();
    const hooks = join(configDir, "hooks");
    const dsl = minimalDsl();
    const config = baseResolvedConfig(configDir);
    const lb = bindingWithOutputs(
      configDir,
      "app",
      {
        out: {
          target: "{hooks}/grp",
          group_by: "lane",
          inline_template: "{{json resolved_checks}}",
        },
      },
      {
        gr1: {
          checks: [
            { lane: "fast", message: "f" },
            { lane: "slow", message: "s" },
          ],
        },
      },
    );

    const result = await generateGuardrails({
      dsl,
      config,
      loadedBindings: [lb],
    });

    const fast = join(hooks, "grp", "fast");
    const slow = join(hooks, "grp", "slow");
    expect([...result.outputFiles].sort()).toEqual([fast, slow].sort());
    expect(await readFile(fast, "utf8")).toContain("f");
    expect(await readFile(slow, "utf8")).toContain("s");
    expect(await readFile(fast, "utf8")).not.toContain('"message": "s"');
  });
});

describe("generateGuardrails reporting context", () => {
  it("includes reporting from observability binding in template context", async () => {
    const configDir = await newConfigDir();
    const hooks = join(configDir, "hooks");
    const dsl = minimalDsl();
    const config = baseResolvedConfig(configDir);
    const observ = loadedBinding(configDir, "observ", {
      software: "observ",
      version: 1,
      reporting: {
        commands: { emit: "observ emit {{id}}" },
        fail_open: false,
        timeout_ms: 4242,
      },
    });
    const app = bindingWithOutputs(configDir, "app", {
      out: {
        target: "{hooks}/report.txt",
        inline_template:
          "{{reporting.commands.emit}}|{{reporting.fail_open}}|{{reporting.timeout_ms}}",
      },
    });

    const result = await generateGuardrails({
      dsl,
      config,
      loadedBindings: [observ, app],
    });

    expect(result.outputFiles).toEqual([join(hooks, "report.txt")]);
    const body = await readFile(join(hooks, "report.txt"), "utf8");
    expect(body).toBe("observ emit {{id}}|false|4242");
  });
});

describe("generateGuardrails source copy (issue #14)", () => {
  it("copies source file to target without template processing", async () => {
    const configDir = await newConfigDir();
    const hooks = join(configDir, "hooks");
    const dsl = minimalDsl();
    const config = baseResolvedConfig(configDir);
    const sourceContent = "#!/usr/bin/env lua\nprint('hello {{not a template}}')\n";
    await mkdir(join(configDir, "scripts"), { recursive: true });
    await writeFile(join(configDir, "scripts/enrich.lua"), sourceContent);
    const lb = bindingWithOutputs(configDir, "app", {
      out: {
        target: "{hooks}/enrich.lua",
        source: "scripts/enrich.lua",
      },
    });

    const result = await generateGuardrails({
      dsl,
      config,
      loadedBindings: [lb],
    });

    expect(result.outputFiles).toEqual([join(hooks, "enrich.lua")]);
    const body = await readFile(join(hooks, "enrich.lua"), "utf8");
    expect(body).toBe(sourceContent);
  });

  it("applies executable flag on source copy", async () => {
    const configDir = await newConfigDir();
    const dsl = minimalDsl();
    const config = baseResolvedConfig(configDir);
    await writeFile(join(configDir, "run.sh"), "#!/bin/sh\necho ok\n");
    const lb = bindingWithOutputs(configDir, "app", {
      out: {
        target: "{hooks}/run.sh",
        source: "run.sh",
        executable: true,
      },
    });

    const result = await generateGuardrails({
      dsl,
      config,
      loadedBindings: [lb],
    });

    const out = result.outputFiles[0]!;
    const s = await stat(out);
    if (process.platform !== "win32") {
      expect(s.mode & 0o111).toBeTruthy();
    }
  });

  it("returns error when source file not found", async () => {
    const configDir = await newConfigDir();
    const dsl = minimalDsl();
    const config = baseResolvedConfig(configDir);
    const lb = bindingWithOutputs(configDir, "app", {
      out: {
        target: "{hooks}/missing.lua",
        source: "nonexistent.lua",
      },
    });

    const result = await generateGuardrails({
      dsl,
      config,
      loadedBindings: [lb],
    });

    expect(result.outputFiles).toEqual([]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        path: "binding.app.outputs.out",
        severity: "error",
        message: expect.stringContaining("Source file not found"),
      }),
    );
  });

  it("dryRun with source returns path but does not copy", async () => {
    const configDir = await newConfigDir();
    const hooks = join(configDir, "hooks");
    const dsl = minimalDsl();
    const config = baseResolvedConfig(configDir);
    await writeFile(join(configDir, "src.txt"), "data");
    const lb = bindingWithOutputs(configDir, "app", {
      out: {
        target: "{hooks}/dst.txt",
        source: "src.txt",
      },
    });

    const result = await generateGuardrails({
      dsl,
      config,
      loadedBindings: [lb],
      dryRun: true,
    });

    expect(result.outputFiles).toEqual([join(hooks, "dst.txt")]);
    await expect(readFile(join(hooks, "dst.txt"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});

describe("generateGuardrails patch merge (issue #13)", () => {
  it("deep-merges JSON when mode is patch", async () => {
    const configDir = await newConfigDir();
    const hooks = join(configDir, "hooks");
    const dsl = minimalDsl();
    const config = baseResolvedConfig(configDir);

    await mkdir(hooks, { recursive: true });
    await writeFile(
      join(hooks, "config.json"),
      JSON.stringify({ existing: true, nested: { a: 1 } }, null, 2),
    );

    const lb = bindingWithOutputs(configDir, "app", {
      out: {
        target: "{hooks}/config.json",
        mode: "patch" as const,
        format: "json" as const,
        patch_strategy: "deep_merge" as const,
        inline_template: '{"nested":{"b":2},"added":true}',
      },
    });

    const result = await generateGuardrails({
      dsl,
      config,
      loadedBindings: [lb],
    });

    expect(result.outputFiles).toEqual([join(hooks, "config.json")]);
    const body = JSON.parse(await readFile(join(hooks, "config.json"), "utf8"));
    expect(body.existing).toBe(true);
    expect(body.nested).toEqual({ a: 1, b: 2 });
    expect(body.added).toBe(true);
  });

  it("writes directly when target does not exist (first patch)", async () => {
    const configDir = await newConfigDir();
    const hooks = join(configDir, "hooks");
    const dsl = minimalDsl();
    const config = baseResolvedConfig(configDir);

    const lb = bindingWithOutputs(configDir, "app", {
      out: {
        target: "{hooks}/new.json",
        mode: "patch" as const,
        format: "json" as const,
        inline_template: '{"key":"value"}',
      },
    });

    const result = await generateGuardrails({
      dsl,
      config,
      loadedBindings: [lb],
    });

    expect(result.outputFiles).toEqual([join(hooks, "new.json")]);
    const body = JSON.parse(await readFile(join(hooks, "new.json"), "utf8"));
    expect(body).toEqual({ key: "value" });
  });

  it("deduplicates arrays by array_merge_key (idempotent)", async () => {
    const configDir = await newConfigDir();
    const hooks = join(configDir, "hooks");
    const dsl = minimalDsl();
    const config = baseResolvedConfig(configDir);

    await mkdir(hooks, { recursive: true });
    await writeFile(
      join(hooks, "hooks.json"),
      JSON.stringify({
        hooks: [
          { id: "hook-a", command: "old" },
          { id: "hook-b", command: "keep" },
        ],
      }, null, 2),
    );

    const lb = bindingWithOutputs(configDir, "app", {
      out: {
        target: "{hooks}/hooks.json",
        mode: "patch" as const,
        format: "json" as const,
        patch_strategy: "deep_merge" as const,
        array_merge_key: "id",
        inline_template: '{"hooks":[{"id":"hook-a","command":"updated"},{"id":"hook-c","command":"new"}]}',
      },
    });

    await generateGuardrails({
      dsl,
      config,
      loadedBindings: [lb],
    });

    const body = JSON.parse(await readFile(join(hooks, "hooks.json"), "utf8"));
    expect(body.hooks).toHaveLength(3);
    expect(body.hooks[0]).toEqual({ id: "hook-a", command: "updated" });
    expect(body.hooks[1]).toEqual({ id: "hook-b", command: "keep" });
    expect(body.hooks[2]).toEqual({ id: "hook-c", command: "new" });

    // Run again — idempotent
    const result2 = await generateGuardrails({
      dsl,
      config,
      loadedBindings: [lb],
    });
    expect(result2.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
    const body2 = JSON.parse(await readFile(join(hooks, "hooks.json"), "utf8"));
    expect(body2.hooks).toHaveLength(3);
  });

  it("deep-merges YAML when format is yaml", async () => {
    const configDir = await newConfigDir();
    const hooks = join(configDir, "hooks");
    const dsl = minimalDsl();
    const config = baseResolvedConfig(configDir);

    await mkdir(hooks, { recursive: true });
    await writeFile(join(hooks, "config.yaml"), "existing: true\nnested:\n  a: 1\n");

    const lb = bindingWithOutputs(configDir, "app", {
      out: {
        target: "{hooks}/config.yaml",
        mode: "patch" as const,
        format: "yaml" as const,
        patch_strategy: "deep_merge" as const,
        inline_template: "nested:\n  b: 2\nadded: true\n",
      },
    });

    const result = await generateGuardrails({
      dsl,
      config,
      loadedBindings: [lb],
    });

    expect(result.outputFiles).toEqual([join(hooks, "config.yaml")]);
    const raw = await readFile(join(hooks, "config.yaml"), "utf8");
    const parsed = await import("yaml").then((m) => m.parse(raw));
    expect(parsed.existing).toBe(true);
    expect(parsed.nested).toEqual({ a: 1, b: 2 });
    expect(parsed.added).toBe(true);
  });

  it("appends text when format is text", async () => {
    const configDir = await newConfigDir();
    const hooks = join(configDir, "hooks");
    const dsl = minimalDsl();
    const config = baseResolvedConfig(configDir);

    await mkdir(hooks, { recursive: true });
    await writeFile(join(hooks, "log.txt"), "line1\n");

    const lb = bindingWithOutputs(configDir, "app", {
      out: {
        target: "{hooks}/log.txt",
        mode: "patch" as const,
        format: "text" as const,
        inline_template: "line2\n",
      },
    });

    const result = await generateGuardrails({
      dsl,
      config,
      loadedBindings: [lb],
    });

    expect(result.outputFiles).toEqual([join(hooks, "log.txt")]);
    const body = await readFile(join(hooks, "log.txt"), "utf8");
    expect(body).toBe("line1\nline2\n");
  });

  it("appends arrays without merge key", async () => {
    const configDir = await newConfigDir();
    const hooks = join(configDir, "hooks");
    const dsl = minimalDsl();
    const config = baseResolvedConfig(configDir);

    await mkdir(hooks, { recursive: true });
    await writeFile(
      join(hooks, "items.json"),
      JSON.stringify({ items: ["a", "b"] }, null, 2),
    );

    const lb = bindingWithOutputs(configDir, "app", {
      out: {
        target: "{hooks}/items.json",
        mode: "patch" as const,
        format: "json" as const,
        patch_strategy: "deep_merge" as const,
        inline_template: '{"items":["c","d"]}',
      },
    });

    await generateGuardrails({ dsl, config, loadedBindings: [lb] });

    const body = JSON.parse(await readFile(join(hooks, "items.json"), "utf8"));
    expect(body.items).toEqual(["a", "b", "c", "d"]);
  });

  it("defaults format to json when not specified in patch mode", async () => {
    const configDir = await newConfigDir();
    const hooks = join(configDir, "hooks");
    const dsl = minimalDsl();
    const config = baseResolvedConfig(configDir);

    await mkdir(hooks, { recursive: true });
    await writeFile(join(hooks, "f.json"), '{"a":1}');

    const lb = bindingWithOutputs(configDir, "app", {
      out: {
        target: "{hooks}/f.json",
        mode: "patch" as const,
        inline_template: '{"b":2}',
      },
    });

    await generateGuardrails({ dsl, config, loadedBindings: [lb] });

    const body = JSON.parse(await readFile(join(hooks, "f.json"), "utf8"));
    expect(body).toEqual({ a: 1, b: 2 });
  });
});

function dslWithEntities(): Dsl {
  return minimalDsl({
    agents: {
      implementer: {
        role_name: "Implementer",
        purpose: "Implement features",
        "x-team": "alpha",
      },
      reviewer: {
        role_name: "Reviewer",
        purpose: "Review code",
      },
    },
    tasks: {
      "implement-feature": {
        description: "Implement a feature",
        target_agent: "implementer",
        allowed_from_agents: ["reviewer"],
        workflow: "dev",
        input_artifacts: [],
        invocation_handoff: "task-handoff",
        result_handoff: "task-handoff",
      },
    },
    artifacts: {
      "source-code": {
        type: "file",
        description: "Source code files",
        owner: "implementer",
        producers: ["implementer"],
        consumers: ["reviewer"],
        editors: [],
        states: ["draft", "final"],
      },
    },
    handoff_types: {
      "task-handoff": {
        version: 1,
        description: "Standard task handoff",
        schema: { type: "object", properties: {} },
      },
    },
    workflow: {
      dev: {
        description: "Development workflow",
        steps: [],
      },
    },
  });
}

describe("DSL entities in binding output context", () => {
  it("exposes tasks in inline_template via {{#each tasks}}", async () => {
    const configDir = await newConfigDir();
    const dsl = dslWithEntities();
    const config = baseResolvedConfig(configDir);
    const lb = bindingWithOutputs(configDir, "app", {
      out: {
        target: "{hooks}/tasks.txt",
        inline_template: "{{#each tasks}}{{@key}}: {{this.description}}\n{{/each}}",
      },
    });

    await generateGuardrails({ dsl, config, loadedBindings: [lb] });

    const body = await readFile(join(configDir, "hooks", "tasks.txt"), "utf8");
    expect(body).toContain("implement-feature: Implement a feature");
  });

  it("exposes agents in inline_template via {{#each agents}}", async () => {
    const configDir = await newConfigDir();
    const dsl = dslWithEntities();
    const config = baseResolvedConfig(configDir);
    const lb = bindingWithOutputs(configDir, "app", {
      out: {
        target: "{hooks}/agents.txt",
        inline_template: "{{#each agents}}{{@key}}: {{this.role_name}}\n{{/each}}",
      },
    });

    await generateGuardrails({ dsl, config, loadedBindings: [lb] });

    const body = await readFile(join(configDir, "hooks", "agents.txt"), "utf8");
    expect(body).toContain("implementer: Implementer");
    expect(body).toContain("reviewer: Reviewer");
  });

  it("exposes artifacts, handoff_types, and workflow", async () => {
    const configDir = await newConfigDir();
    const dsl = dslWithEntities();
    const config = baseResolvedConfig(configDir);
    const lb = bindingWithOutputs(configDir, "app", {
      out: {
        target: "{hooks}/all.txt",
        inline_template: [
          "artifacts:{{#each artifacts}} {{@key}}{{/each}}",
          "handoffs:{{#each handoff_types}} {{@key}}{{/each}}",
          "workflows:{{#each workflow}} {{@key}}{{/each}}",
        ].join("\n"),
      },
    });

    await generateGuardrails({ dsl, config, loadedBindings: [lb] });

    const body = await readFile(join(configDir, "hooks", "all.txt"), "utf8");
    expect(body).toContain("artifacts: source-code");
    expect(body).toContain("handoffs: task-handoff");
    expect(body).toContain("workflows: dev");
  });

  it("exposes passthrough (x-*) fields on agents", async () => {
    const configDir = await newConfigDir();
    const dsl = dslWithEntities();
    const config = baseResolvedConfig(configDir);
    const lb = bindingWithOutputs(configDir, "app", {
      out: {
        target: "{hooks}/ext.txt",
        inline_template: "team={{agents.implementer.x-team}}",
      },
    });

    await generateGuardrails({ dsl, config, loadedBindings: [lb] });

    const body = await readFile(join(configDir, "hooks", "ext.txt"), "utf8");
    expect(body).toBe("team=alpha");
  });
});

function bindingWithRenders(
  configDir: string,
  software: string,
  renders: NonNullable<SoftwareBinding["renders"]>,
  extras: Partial<SoftwareBinding> = {},
): LoadedBinding {
  return loadedBinding(configDir, software, {
    software,
    version: 1,
    guardrail_impl: {
      gr1: { checks: [{ message: "check-a" }] },
    },
    renders,
    ...extras,
  });
}

describe("binding renders", () => {
  it("renders system context with inline_template", async () => {
    const configDir = await newConfigDir();
    const dsl = dslWithEntities();
    const config = baseResolvedConfig(configDir, {
      paths: { out: join(configDir, "gen") },
    });
    const lb = bindingWithRenders(configDir, "app", [
      {
        context: "system" as const,
        output: "{out}/sys.txt",
        inline_template: "name={{system.name}}",
      },
    ]);

    const result = await generateGuardrails({ dsl, config, loadedBindings: [lb] });

    expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(result.outputFiles).toEqual([join(configDir, "gen", "sys.txt")]);
    const body = await readFile(join(configDir, "gen", "sys.txt"), "utf8");
    expect(body).toBe("name=System");
  });

  it("renders agent context with entity iteration", async () => {
    const configDir = await newConfigDir();
    const dsl = dslWithEntities();
    const config = baseResolvedConfig(configDir, {
      paths: { out: join(configDir, "gen") },
    });
    const lb = bindingWithRenders(configDir, "app", [
      {
        context: "agent" as const,
        output: "{out}/{agent.id}.md",
        inline_template: "# {{agent.role_name}}\n{{agent.purpose}}",
      },
    ]);

    const result = await generateGuardrails({ dsl, config, loadedBindings: [lb] });

    expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(result.outputFiles).toHaveLength(2);

    const impl = await readFile(join(configDir, "gen", "implementer.md"), "utf8");
    expect(impl).toBe("# Implementer\nImplement features");
    const rev = await readFile(join(configDir, "gen", "reviewer.md"), "utf8");
    expect(rev).toBe("# Reviewer\nReview code");
  });

  it("supports include filter on entity renders", async () => {
    const configDir = await newConfigDir();
    const dsl = dslWithEntities();
    const config = baseResolvedConfig(configDir, {
      paths: { out: join(configDir, "gen") },
    });
    const lb = bindingWithRenders(configDir, "app", [
      {
        context: "agent" as const,
        output: "{out}/{agent.id}.md",
        inline_template: "{{agent.role_name}}",
        include: ["implementer"],
      },
    ]);

    const result = await generateGuardrails({ dsl, config, loadedBindings: [lb] });

    expect(result.outputFiles).toHaveLength(1);
    expect(result.outputFiles[0]).toContain("implementer.md");
  });

  it("supports exclude filter on entity renders", async () => {
    const configDir = await newConfigDir();
    const dsl = dslWithEntities();
    const config = baseResolvedConfig(configDir, {
      paths: { out: join(configDir, "gen") },
    });
    const lb = bindingWithRenders(configDir, "app", [
      {
        context: "agent" as const,
        output: "{out}/{agent.id}.md",
        inline_template: "{{agent.role_name}}",
        exclude: ["reviewer"],
      },
    ]);

    const result = await generateGuardrails({ dsl, config, loadedBindings: [lb] });

    expect(result.outputFiles).toHaveLength(1);
    expect(result.outputFiles[0]).toContain("implementer.md");
  });

  it("renders with external template file", async () => {
    const configDir = await newConfigDir();
    const dsl = dslWithEntities();
    const tplDir = join(configDir, "templates");
    await mkdir(tplDir, { recursive: true });
    await writeFile(join(tplDir, "agent.hbs"), "Role: {{agent.role_name}}");

    const config = baseResolvedConfig(configDir, {
      paths: { out: join(configDir, "gen") },
    });
    const lb = bindingWithRenders(configDir, "app", [
      {
        context: "agent" as const,
        output: "{out}/{agent.id}.md",
        template: "templates/agent.hbs",
      },
    ]);

    const result = await generateGuardrails({ dsl, config, loadedBindings: [lb] });

    expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    const body = await readFile(join(configDir, "gen", "implementer.md"), "utf8");
    expect(body).toBe("Role: Implementer");
  });

  it("skips empty renders when skip_empty is true", async () => {
    const configDir = await newConfigDir();
    const dsl = dslWithEntities();
    const config = baseResolvedConfig(configDir, {
      paths: { out: join(configDir, "gen") },
    });
    const lb = bindingWithRenders(configDir, "app", [
      {
        context: "system" as const,
        output: "{out}/maybe.txt",
        inline_template: "",
        skip_empty: true,
      },
    ]);

    const result = await generateGuardrails({ dsl, config, loadedBindings: [lb] });

    expect(result.outputFiles).toEqual([]);
  });

  it("makes file executable when executable is true", async () => {
    const configDir = await newConfigDir();
    const dsl = dslWithEntities();
    const config = baseResolvedConfig(configDir, {
      paths: { out: join(configDir, "gen") },
    });
    const lb = bindingWithRenders(configDir, "app", [
      {
        context: "system" as const,
        output: "{out}/run.sh",
        inline_template: "#!/bin/bash\necho hi",
        executable: true,
      },
    ]);

    await generateGuardrails({ dsl, config, loadedBindings: [lb] });

    const st = await stat(join(configDir, "gen", "run.sh"));
    expect(st.mode & 0o755).toBe(0o755);
  });

  it("exposes vars and paths in binding render context", async () => {
    const configDir = await newConfigDir();
    const dsl = dslWithEntities();
    const config = baseResolvedConfig(configDir, {
      vars: { env: "production" },
      paths: { out: join(configDir, "gen") },
    });
    const lb = bindingWithRenders(configDir, "app", [
      {
        context: "system" as const,
        output: "{out}/info.txt",
        inline_template: "env={{vars.env}}",
      },
    ]);

    await generateGuardrails({ dsl, config, loadedBindings: [lb] });

    const body = await readFile(join(configDir, "gen", "info.txt"), "utf8");
    expect(body).toBe("env=production");
  });

  it("returns error when template file not found", async () => {
    const configDir = await newConfigDir();
    const dsl = dslWithEntities();
    const config = baseResolvedConfig(configDir, {
      paths: { out: join(configDir, "gen") },
    });
    const lb = bindingWithRenders(configDir, "app", [
      {
        context: "system" as const,
        output: "{out}/x.txt",
        template: "nonexistent.hbs",
      },
    ]);

    const result = await generateGuardrails({ dsl, config, loadedBindings: [lb] });

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        path: "binding.app.renders",
        severity: "error",
        message: expect.stringContaining("Template file not found"),
      }),
    );
  });

  it("processes binding with only renders (no outputs)", async () => {
    const configDir = await newConfigDir();
    const dsl = dslWithEntities();
    const config = baseResolvedConfig(configDir, {
      paths: { out: join(configDir, "gen") },
    });
    const lb = loadedBinding(configDir, "render-only", {
      software: "render-only",
      version: 1,
      guardrail_impl: {
        gr1: { checks: [{ message: "check" }] },
      },
      renders: [
        {
          context: "system" as const,
          output: "{out}/hello.txt",
          inline_template: "hello",
        },
      ],
    });

    const result = await generateGuardrails({ dsl, config, loadedBindings: [lb] });

    expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(result.outputFiles).toEqual([join(configDir, "gen", "hello.txt")]);
    const body = await readFile(join(configDir, "gen", "hello.txt"), "utf8");
    expect(body).toBe("hello");
  });

  it("renders task context with entity iteration", async () => {
    const configDir = await newConfigDir();
    const dsl = dslWithEntities();
    const config = baseResolvedConfig(configDir, {
      paths: { out: join(configDir, "gen") },
    });
    const lb = bindingWithRenders(configDir, "app", [
      {
        context: "task" as const,
        output: "{out}/{task.id}.txt",
        inline_template: "{{task.description}} -> {{task.target_agent}}",
      },
    ]);

    const result = await generateGuardrails({ dsl, config, loadedBindings: [lb] });

    expect(result.outputFiles).toHaveLength(1);
    const body = await readFile(join(configDir, "gen", "implement-feature.txt"), "utf8");
    expect(body).toBe("Implement a feature -> implementer");
  });

  it("renders workflow context with entity iteration", async () => {
    const configDir = await newConfigDir();
    const dsl = dslWithEntities();
    const config = baseResolvedConfig(configDir, {
      paths: { out: join(configDir, "gen") },
    });
    const lb = bindingWithRenders(configDir, "app", [
      {
        context: "workflow" as const,
        output: "{out}/{workflow.id}.txt",
        inline_template: "{{workflow.description}}",
      },
    ]);

    const result = await generateGuardrails({ dsl, config, loadedBindings: [lb] });

    expect(result.outputFiles).toHaveLength(1);
    const body = await readFile(join(configDir, "gen", "dev.txt"), "utf8");
    expect(body).toBe("Development workflow");
  });
});
