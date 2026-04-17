import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadBindings } from "../../src/config/binding-loader.js";
import { ConfigLoadError } from "../../src/config/loader.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "binding-loader-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("loadBindings", () => {
  it("loads a valid binding YAML file", async () => {
    const filePath = join(tempDir, "binding.yaml");
    await writeFile(
      filePath,
      `software: cursor\nversion: 1\nguardrail_impl:\n  gr:\n    checks:\n      - message: ok\n`,
    );
    const results = await loadBindings([filePath]);
    expect(results).toHaveLength(1);
    expect(results[0].filePath).toBe(filePath);
    expect(results[0].binding.software).toBe("cursor");
    expect(results[0].binding.version).toBe(1);
  });

  it("loads multiple binding files", async () => {
    const a = join(tempDir, "a.yaml");
    const b = join(tempDir, "b.yaml");
    await writeFile(
      a,
      `software: cursor\nversion: 1\nguardrail_impl:\n  g:\n    checks: []\n`,
    );
    await writeFile(
      b,
      `software: vscode\nversion: 1\nguardrail_impl:\n  g:\n    checks: []\n`,
    );
    const results = await loadBindings([a, b]);
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.binding.software)).toEqual(["cursor", "vscode"]);
  });

  it("throws ConfigLoadError for non-existent file", async () => {
    const missing = join(tempDir, "missing.yaml");
    await expect(loadBindings([missing])).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof ConfigLoadError && err.filePath === missing,
    );
  });

  it("throws ConfigLoadError for invalid YAML syntax", async () => {
    const filePath = join(tempDir, "bad.yaml");
    await writeFile(filePath, ":\n  :\n   {{{{\n");
    await expect(loadBindings([filePath])).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof ConfigLoadError &&
        err.message.includes("Invalid YAML syntax") &&
        err.filePath === filePath,
    );
  });

  it("throws ConfigLoadError for invalid schema", async () => {
    const filePath = join(tempDir, "invalid.yaml");
    await writeFile(filePath, "version: 1\n");
    await expect(loadBindings([filePath])).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof ConfigLoadError &&
        err.message.includes("Invalid binding schema") &&
        err.filePath === filePath,
    );
  });

  it("returns empty array for empty input array", async () => {
    await expect(loadBindings([])).resolves.toEqual([]);
  });

  it("parses binding with expected software and version fields", async () => {
    const filePath = join(tempDir, "x.yaml");
    await writeFile(
      filePath,
      `software: my-ide\nversion: 1\nreporting:\n  commands: {}\n  fail_open: true\n  timeout_ms: 3000\n`,
    );
    const [row] = await loadBindings([filePath]);
    expect(row.binding.software).toBe("my-ide");
    expect(row.binding.version).toBe(1);
  });
});

describe("loadBindings — extends", () => {
  it("merges guardrail_impl from base binding via extends", async () => {
    const baseDir = join(tempDir, "base");
    await mkdir(baseDir, { recursive: true });

    const basePath = join(baseDir, "cursor.yaml");
    await writeFile(
      basePath,
      [
        "software: cursor",
        "version: 1",
        "guardrail_impl:",
        "  no-force-push:",
        "    checks:",
        "      - message: base check",
        "  no-rebase:",
        "    checks:",
        "      - message: rebase check",
      ].join("\n"),
    );

    const childPath = join(tempDir, "cursor-project.yaml");
    await writeFile(
      childPath,
      [
        `extends: ./base/cursor.yaml`,
        "software: cursor",
        "version: 1",
        "guardrail_impl:",
        "  project-guard:",
        "    checks:",
        "      - message: project check",
      ].join("\n"),
    );

    const [result] = await loadBindings([childPath]);
    const implKeys = Object.keys(result.binding.guardrail_impl ?? {});
    expect(implKeys).toContain("no-force-push");
    expect(implKeys).toContain("no-rebase");
    expect(implKeys).toContain("project-guard");
    expect(implKeys).toHaveLength(3);
  });

  it("child guardrail_impl overrides base for same guardrail ID", async () => {
    const basePath = join(tempDir, "base.yaml");
    await writeFile(
      basePath,
      [
        "software: cursor",
        "version: 1",
        "guardrail_impl:",
        "  gr1:",
        "    checks:",
        "      - message: from base",
      ].join("\n"),
    );

    const childPath = join(tempDir, "child.yaml");
    await writeFile(
      childPath,
      [
        "extends: ./base.yaml",
        "software: cursor",
        "version: 1",
        "guardrail_impl:",
        "  gr1:",
        "    checks:",
        "      - message: from child",
      ].join("\n"),
    );

    const [result] = await loadBindings([childPath]);
    const checks = result.binding.guardrail_impl!["gr1"]!.checks;
    expect(checks).toHaveLength(1);
    expect(checks[0]).toMatchObject({ message: "from child" });
  });

  it("child outputs override base outputs for same output ID", async () => {
    const basePath = join(tempDir, "base.yaml");
    await writeFile(
      basePath,
      [
        "software: cursor",
        "version: 1",
        "outputs:",
        "  policy-bundle:",
        "    target: '{cursor_root}/guardrails/base-policy.json'",
        "    mode: write",
        "    inline_template: base",
      ].join("\n"),
    );

    const childPath = join(tempDir, "child.yaml");
    await writeFile(
      childPath,
      [
        "extends: ./base.yaml",
        "software: cursor",
        "version: 1",
        "outputs:",
        "  policy-bundle:",
        "    target: '{cursor_root}/guardrails/policy.json'",
        "    mode: write",
        "    inline_template: child",
      ].join("\n"),
    );

    const [result] = await loadBindings([childPath]);
    expect(result.binding.outputs!["policy-bundle"]!.target).toBe(
      "{cursor_root}/guardrails/policy.json",
    );
  });

  it("inherits base outputs when child does not define outputs", async () => {
    const basePath = join(tempDir, "base.yaml");
    await writeFile(
      basePath,
      [
        "software: cursor",
        "version: 1",
        "outputs:",
        "  hook-script:",
        "    target: '{cursor_root}/hooks/eval.sh'",
        "    mode: write",
        "    inline_template: inherited",
      ].join("\n"),
    );

    const childPath = join(tempDir, "child.yaml");
    await writeFile(
      childPath,
      [
        "extends: ./base.yaml",
        "software: cursor",
        "version: 1",
        "guardrail_impl:",
        "  gr1:",
        "    checks:",
        "      - message: child check",
      ].join("\n"),
    );

    const [result] = await loadBindings([childPath]);
    expect(result.binding.outputs!["hook-script"]!.target).toBe(
      "{cursor_root}/hooks/eval.sh",
    );
  });

  it("child software field overrides base software", async () => {
    const basePath = join(tempDir, "base.yaml");
    await writeFile(basePath, "software: base-cursor\nversion: 1\n");

    const childPath = join(tempDir, "child.yaml");
    await writeFile(
      childPath,
      "extends: ./base.yaml\nsoftware: cursor\nversion: 1\n",
    );

    const [result] = await loadBindings([childPath]);
    expect(result.binding.software).toBe("cursor");
  });

  it("supports chained extends (grandparent → parent → child)", async () => {
    const gpPath = join(tempDir, "gp.yaml");
    await writeFile(
      gpPath,
      [
        "software: cursor",
        "version: 1",
        "guardrail_impl:",
        "  gr-gp:",
        "    checks:",
        "      - message: grandparent",
      ].join("\n"),
    );

    const parentPath = join(tempDir, "parent.yaml");
    await writeFile(
      parentPath,
      [
        "extends: ./gp.yaml",
        "software: cursor",
        "version: 1",
        "guardrail_impl:",
        "  gr-parent:",
        "    checks:",
        "      - message: parent",
      ].join("\n"),
    );

    const childPath = join(tempDir, "child.yaml");
    await writeFile(
      childPath,
      [
        "extends: ./parent.yaml",
        "software: cursor",
        "version: 1",
        "guardrail_impl:",
        "  gr-child:",
        "    checks:",
        "      - message: child",
      ].join("\n"),
    );

    const [result] = await loadBindings([childPath]);
    const implKeys = Object.keys(result.binding.guardrail_impl ?? {});
    expect(implKeys).toContain("gr-gp");
    expect(implKeys).toContain("gr-parent");
    expect(implKeys).toContain("gr-child");
  });

  it("throws on circular extends", async () => {
    const aPath = join(tempDir, "a.yaml");
    const bPath = join(tempDir, "b.yaml");
    await writeFile(aPath, "extends: ./b.yaml\nsoftware: x\nversion: 1\n");
    await writeFile(bPath, "extends: ./a.yaml\nsoftware: x\nversion: 1\n");

    await expect(loadBindings([aPath])).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof ConfigLoadError &&
        err.message.includes("Circular binding extends"),
    );
  });

  it("throws when extends target does not exist", async () => {
    const childPath = join(tempDir, "child.yaml");
    await writeFile(
      childPath,
      "extends: ./nonexistent.yaml\nsoftware: x\nversion: 1\n",
    );

    await expect(loadBindings([childPath])).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof ConfigLoadError &&
        err.message.includes("Base binding path not found"),
    );
  });

  it("resolves extends pointing to a directory with binding.yaml", async () => {
    const baseDir = join(tempDir, "base-pkg");
    await mkdir(baseDir, { recursive: true });
    await writeFile(
      join(baseDir, "binding.yaml"),
      [
        "software: cursor",
        "version: 1",
        "guardrail_impl:",
        "  base-gr:",
        "    checks:",
        "      - message: from dir",
      ].join("\n"),
    );

    const childPath = join(tempDir, "child.yaml");
    await writeFile(
      childPath,
      [
        "extends: ./base-pkg",
        "software: cursor",
        "version: 1",
        "guardrail_impl:",
        "  child-gr:",
        "    checks:",
        "      - message: from child",
      ].join("\n"),
    );

    const [result] = await loadBindings([childPath]);
    const implKeys = Object.keys(result.binding.guardrail_impl ?? {});
    expect(implKeys).toContain("base-gr");
    expect(implKeys).toContain("child-gr");
  });

  it("child inherits base reporting when child omits it", async () => {
    const basePath = join(tempDir, "base.yaml");
    await writeFile(
      basePath,
      [
        "software: observ",
        "version: 1",
        "reporting:",
        "  commands:",
        "    emit: 'observ emit {{id}}'",
        "  fail_open: true",
        "  timeout_ms: 5000",
      ].join("\n"),
    );

    const childPath = join(tempDir, "child.yaml");
    await writeFile(
      childPath,
      "extends: ./base.yaml\nsoftware: observ\nversion: 1\n",
    );

    const [result] = await loadBindings([childPath]);
    expect(result.binding.reporting?.commands).toEqual({ emit: "observ emit {{id}}" });
  });

  it("supports $append merge operator on guardrail_impl checks", async () => {
    const basePath = join(tempDir, "base.yaml");
    await writeFile(
      basePath,
      [
        "software: cursor",
        "version: 1",
        "guardrail_impl:",
        "  gr1:",
        "    checks:",
        "      - message: base-check-1",
      ].join("\n"),
    );

    const childPath = join(tempDir, "child.yaml");
    await writeFile(
      childPath,
      [
        "extends: ./base.yaml",
        "software: cursor",
        "version: 1",
        "guardrail_impl:",
        "  gr1:",
        "    checks:",
        "      $append:",
        "        - message: child-check-2",
      ].join("\n"),
    );

    const [result] = await loadBindings([childPath]);
    const checks = result.binding.guardrail_impl!["gr1"]!.checks;
    expect(checks).toHaveLength(2);
    expect(checks[0]).toMatchObject({ message: "base-check-1" });
    expect(checks[1]).toMatchObject({ message: "child-check-2" });
  });
});
