import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile, mkdir, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Dsl } from "../src/schema/index.js";
import type { ResolvedRenderTarget } from "../src/config/types.js";
import { renderFromConfig, checkDriftFromConfig } from "../src/renderer/renderer.js";

const TEMP_DIR = join(import.meta.dirname, "__tmp_renderer__");

function createMinimalDsl(): Dsl {
  return {
    version: 1,
    system: {
      id: "test-system",
      name: "Test System",
      default_workflow_order: ["plan"],
    },
    agents: {
      dev: {
        role_name: "Developer",
        purpose: "Write code",
        can_read_artifacts: [],
        can_write_artifacts: [],
        can_execute_tools: [],
        can_perform_validations: [],
        can_invoke_agents: [],
        can_return_handoffs: [],
      },
      reviewer: {
        role_name: "Reviewer",
        purpose: "Review code",
        can_read_artifacts: [],
        can_write_artifacts: [],
        can_execute_tools: [],
        can_perform_validations: [],
        can_invoke_agents: [],
        can_return_handoffs: [],
      },
    },
    tasks: {},
    artifacts: {},
    tools: {},
    validations: {},
    handoff_types: {},
    workflow: {},
    policies: {},
  };
}

beforeEach(async () => {
  await mkdir(join(TEMP_DIR, "tpl"), { recursive: true });
  await mkdir(join(TEMP_DIR, "out"), { recursive: true });
});

afterEach(async () => {
  await rm(TEMP_DIR, { recursive: true, force: true });
});

describe("renderFromConfig", () => {
  it("renders system context to single file", async () => {
    const tplPath = join(TEMP_DIR, "tpl", "overview.hbs");
    await writeFile(tplPath, "# {{system.name}}");
    const outPath = join(TEMP_DIR, "out", "overview.md");

    const targets: ResolvedRenderTarget[] = [
      { template: tplPath, context: "system", output: outPath },
    ];
    const dsl = createMinimalDsl();
    const files = await renderFromConfig(dsl, targets);

    expect(files).toEqual([outPath]);
    const content = await readFile(outPath, "utf8");
    expect(content).toBe("# Test System");
  });

  it("renders agent context per agent", async () => {
    const tplPath = join(TEMP_DIR, "tpl", "agent.hbs");
    await writeFile(tplPath, "# {{agent.role_name}}\n{{agent.id}}");
    const outPattern = join(TEMP_DIR, "out", "{agent.id}.md");

    const targets: ResolvedRenderTarget[] = [
      { template: tplPath, context: "agent", output: outPattern },
    ];
    const dsl = createMinimalDsl();
    const files = await renderFromConfig(dsl, targets);

    expect(files).toHaveLength(2);

    const devContent = await readFile(
      join(TEMP_DIR, "out", "dev.md"),
      "utf8",
    );
    expect(devContent).toContain("# Developer");
    expect(devContent).toContain("dev");

    const reviewerContent = await readFile(
      join(TEMP_DIR, "out", "reviewer.md"),
      "utf8",
    );
    expect(reviewerContent).toContain("# Reviewer");
  });

  it("respects include filter", async () => {
    const tplPath = join(TEMP_DIR, "tpl", "agent.hbs");
    await writeFile(tplPath, "{{agent.id}}");
    const outPattern = join(TEMP_DIR, "out", "{agent.id}.md");

    const targets: ResolvedRenderTarget[] = [
      {
        template: tplPath,
        context: "agent",
        output: outPattern,
        include: ["dev"],
      },
    ];
    const dsl = createMinimalDsl();
    const files = await renderFromConfig(dsl, targets);

    expect(files).toHaveLength(1);
    expect(files[0]).toContain("dev.md");
  });

  it("respects exclude filter", async () => {
    const tplPath = join(TEMP_DIR, "tpl", "agent.hbs");
    await writeFile(tplPath, "{{agent.id}}");
    const outPattern = join(TEMP_DIR, "out", "{agent.id}.md");

    const targets: ResolvedRenderTarget[] = [
      {
        template: tplPath,
        context: "agent",
        output: outPattern,
        exclude: ["dev"],
      },
    ];
    const dsl = createMinimalDsl();
    const files = await renderFromConfig(dsl, targets);

    expect(files).toHaveLength(1);
    expect(files[0]).toContain("reviewer.md");
  });

  it("can access dsl from agent context", async () => {
    const tplPath = join(TEMP_DIR, "tpl", "agent-with-dsl.hbs");
    await writeFile(tplPath, "{{agent.id}} in {{dsl.system.name}}");
    const outPattern = join(TEMP_DIR, "out", "{agent.id}.md");

    const targets: ResolvedRenderTarget[] = [
      {
        template: tplPath,
        context: "agent",
        output: outPattern,
        include: ["dev"],
      },
    ];
    const dsl = createMinimalDsl();
    await renderFromConfig(dsl, targets);

    const content = await readFile(join(TEMP_DIR, "out", "dev.md"), "utf8");
    expect(content).toBe("dev in Test System");
  });

  it("can access dsl from system context", async () => {
    const tplPath = join(TEMP_DIR, "tpl", "sys.hbs");
    await writeFile(tplPath, "{{system.name}} has {{#each dsl.agents}}{{@key}} {{/each}}");
    const outPath = join(TEMP_DIR, "out", "sys.md");

    const targets: ResolvedRenderTarget[] = [
      { template: tplPath, context: "system", output: outPath },
    ];
    const dsl = createMinimalDsl();
    await renderFromConfig(dsl, targets);

    const content = await readFile(outPath, "utf8");
    expect(content).toContain("Test System");
    expect(content).toContain("dev");
    expect(content).toContain("reviewer");
  });
});

describe("checkDriftFromConfig", () => {
  it("reports no drift when files match", async () => {
    const tplPath = join(TEMP_DIR, "tpl", "agent.hbs");
    await writeFile(tplPath, "{{agent.id}}");
    const outPattern = join(TEMP_DIR, "out", "{agent.id}.md");

    const targets: ResolvedRenderTarget[] = [
      { template: tplPath, context: "agent", output: outPattern },
    ];
    const dsl = createMinimalDsl();

    await renderFromConfig(dsl, targets);
    const { hasDrift, diffs } = await checkDriftFromConfig(dsl, targets);

    expect(hasDrift).toBe(false);
    expect(diffs).toHaveLength(0);
  });

  it("detects drift when file content differs", async () => {
    const tplPath = join(TEMP_DIR, "tpl", "agent.hbs");
    await writeFile(tplPath, "{{agent.id}}");
    const outPattern = join(TEMP_DIR, "out", "{agent.id}.md");

    const targets: ResolvedRenderTarget[] = [
      { template: tplPath, context: "agent", output: outPattern },
    ];
    const dsl = createMinimalDsl();

    await renderFromConfig(dsl, targets);
    await writeFile(join(TEMP_DIR, "out", "dev.md"), "modified content");

    const { hasDrift, diffs } = await checkDriftFromConfig(dsl, targets);
    expect(hasDrift).toBe(true);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toContain("dev.md");
  });

  it("detects drift when file is missing", async () => {
    const tplPath = join(TEMP_DIR, "tpl", "overview.hbs");
    await writeFile(tplPath, "# {{system.name}}");
    const outPath = join(TEMP_DIR, "out", "overview.md");

    const targets: ResolvedRenderTarget[] = [
      { template: tplPath, context: "system", output: outPath },
    ];
    const dsl = createMinimalDsl();

    const { hasDrift, diffs } = await checkDriftFromConfig(dsl, targets);
    expect(hasDrift).toBe(true);
    expect(diffs).toEqual([outPath]);
  });
});
