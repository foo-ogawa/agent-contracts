import { readFileSync, existsSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { parse as parseYaml } from "yaml";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { DslSchema, type Dsl } from "../../src/schema/index.js";
import { buildGlobalContext, buildPerAgentContext } from "../../src/renderer/context.js";
import { renderFromConfig, checkDriftFromConfig } from "../../src/renderer/renderer.js";
import type { ResolvedRenderTarget } from "../../src/config/types.js";

const fixturesDir = resolve(import.meta.dirname, "../fixtures");
const templateDir = join(fixturesDir, "templates");
const outputDir = join(import.meta.dirname, "../__output__");

let fullDsl: Dsl;

beforeAll(() => {
  const data = parseYaml(
    readFileSync(join(fixturesDir, "full/agent-contracts.yaml"), "utf8"),
  );
  fullDsl = DslSchema.parse(data);
});

afterAll(() => {
  if (existsSync(outputDir)) {
    rmSync(outputDir, { recursive: true, force: true });
  }
});

describe("buildGlobalContext", () => {
  it("includes all entities and x- properties", () => {
    const ctx = buildGlobalContext(fullDsl);
    expect(ctx.system.id).toBe("full-system");
    expect(Object.keys(ctx.agents).length).toBeGreaterThan(0);
    expect(Object.keys(ctx.tasks).length).toBeGreaterThan(0);
    expect(Object.keys(ctx.artifacts).length).toBeGreaterThan(0);
    expect((ctx.system as Record<string, unknown>)["x-system-meta"]).toBeDefined();
  });
});

describe("buildPerAgentContext", () => {
  it("builds context for agent with related tasks, artifacts, tools", () => {
    const agent = { ...fullDsl.agents["main-architect"], id: "main-architect" };
    const ctx = buildPerAgentContext(fullDsl, agent);

    expect(ctx.agent.id).toBe("main-architect");
    expect(Object.keys(ctx.relatedArtifacts).length).toBeGreaterThan(0);
    expect(Object.keys(ctx.relatedTools).length).toBeGreaterThan(0);
  });

  it("includes dsl reference in context", () => {
    const agent = { ...fullDsl.agents["main-architect"], id: "main-architect" };
    const ctx = buildPerAgentContext(fullDsl, agent);
    expect(ctx.dsl).toBe(fullDsl);
  });

  it("merges behavioral specs: Agent + Task responsibilities combined", () => {
    const agent = { ...fullDsl.agents["implementer"], id: "implementer" };
    const ctx = buildPerAgentContext(fullDsl, agent);

    expect(ctx.mergedBehavior.responsibilities.length).toBeGreaterThan(0);
    expect(ctx.mergedBehavior.execution_steps.length).toBeGreaterThan(0);
    expect(ctx.mergedBehavior.completion_criteria.length).toBeGreaterThan(0);
  });

  it("rules merge: task rule with same id overrides agent rule", () => {
    const dsl = DslSchema.parse({
      version: 1,
      system: { id: "s", name: "S", default_workflow_order: ["impl"] },
      agents: {
        a1: {
          role_name: "R",
          purpose: "P",
          rules: [
            { id: "R1", description: "Agent version", severity: "mandatory" },
          ],
        },
      },
      tasks: {
        t1: {
          description: "d",
          target_agent: "a1",
          allowed_from_agents: ["a1"],
          workflow: "impl",
          input_artifacts: [],
          invocation_handoff: "h",
          result_handoff: "r",
          rules: [
            { id: "R1", description: "Task version", severity: "recommended" },
          ],
        },
      },
    });
    const agent = { ...dsl.agents["a1"], id: "a1" };
    const ctx = buildPerAgentContext(dsl, agent);
    const r1 = ctx.mergedBehavior.rules.find((r) => r["id"] === "R1");
    expect(r1!["description"]).toBe("Task version");
    expect(r1!["severity"]).toBe("recommended");
  });
});

function agentTarget(tpl: string, out: string, opts?: Partial<ResolvedRenderTarget>): ResolvedRenderTarget {
  return { template: tpl, context: "agent", output: out, ...opts };
}

function systemTarget(tpl: string, out: string): ResolvedRenderTarget {
  return { template: tpl, context: "system", output: out };
}

describe("renderFromConfig", () => {
  it("generates per-agent md files", async () => {
    const targets: ResolvedRenderTarget[] = [
      agentTarget(
        join(templateDir, "agent-prompt.md.hbs"),
        join(outputDir, "{agent.id}.md"),
      ),
    ];
    const files = await renderFromConfig(fullDsl, targets);
    expect(files.length).toBeGreaterThan(0);

    const implFile = files.find((f) => f.includes("implementer"));
    expect(implFile).toBeDefined();
    const content = readFileSync(implFile!, "utf8");
    expect(content).toContain("Implementer");
    expect(content).toContain("Purpose");
  });

  it("generates system overview file", async () => {
    const targets: ResolvedRenderTarget[] = [
      systemTarget(
        join(templateDir, "overview.md.hbs"),
        join(outputDir, "overview.md"),
      ),
    ];
    const files = await renderFromConfig(fullDsl, targets);
    const overviewFile = files.find((f) => f.includes("overview"));
    expect(overviewFile).toBeDefined();
    const content = readFileSync(overviewFile!, "utf8");
    expect(content).toContain("Full Fixture");
    expect(content).toContain("main-architect");
  });

  it("renders x- properties when present", async () => {
    const targets: ResolvedRenderTarget[] = [
      agentTarget(
        join(templateDir, "agent-prompt.md.hbs"),
        join(outputDir, "{agent.id}.md"),
      ),
    ];
    const files = await renderFromConfig(fullDsl, targets);
    const archFile = files.find((f) => f.includes("main-architect"));
    expect(archFile).toBeDefined();
    const content = readFileSync(archFile!, "utf8");
    expect(content).toContain("Identity");
    expect(content).toContain("Architect identity text");
  });

  it("omits x- sections when absent", async () => {
    const targets: ResolvedRenderTarget[] = [
      agentTarget(
        join(templateDir, "agent-prompt.md.hbs"),
        join(outputDir, "{agent.id}.md"),
      ),
    ];
    const files = await renderFromConfig(fullDsl, targets);
    const twFile = files.find((f) => f.includes("test-writer"));
    expect(twFile).toBeDefined();
    const content = readFileSync(twFile!, "utf8");
    expect(content).not.toContain("Identity");
    expect(content).not.toContain("Role Selection Guide");
  });
});

describe("checkDriftFromConfig", () => {
  it("returns no drift when files are up to date", async () => {
    const targets: ResolvedRenderTarget[] = [
      agentTarget(
        join(templateDir, "agent-prompt.md.hbs"),
        join(outputDir, "{agent.id}.md"),
      ),
      systemTarget(
        join(templateDir, "overview.md.hbs"),
        join(outputDir, "overview.md"),
      ),
    ];
    await renderFromConfig(fullDsl, targets);
    const result = await checkDriftFromConfig(fullDsl, targets);
    expect(result.hasDrift).toBe(false);
    expect(result.diffs).toHaveLength(0);
  });

  it("returns drift when files are missing", async () => {
    const emptyDir = join(import.meta.dirname, "../__empty_output__");
    const targets: ResolvedRenderTarget[] = [
      agentTarget(
        join(templateDir, "agent-prompt.md.hbs"),
        join(emptyDir, "{agent.id}.md"),
      ),
      systemTarget(
        join(templateDir, "overview.md.hbs"),
        join(emptyDir, "overview.md"),
      ),
    ];
    const result = await checkDriftFromConfig(fullDsl, targets);
    expect(result.hasDrift).toBe(true);
    expect(result.diffs.length).toBeGreaterThan(0);
  });
});
