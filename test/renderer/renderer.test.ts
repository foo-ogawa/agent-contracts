import { readFileSync, existsSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { parse as parseYaml } from "yaml";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { DslSchema, type Dsl } from "../../src/schema/index.js";
import { buildGlobalContext, buildPerAgentContext, buildWorkflowContext } from "../../src/renderer/context.js";
import { renderFromConfig, checkDriftFromConfig } from "../../src/renderer/renderer.js";
import { generateSequenceDiagram } from "../../src/renderer/sequence-diagram.js";
import { generateOverviewFlowchart } from "../../src/renderer/overview-flowchart.js";
import { artifactOwnershipRule } from "../../src/linter/rules/artifact-ownership.js";
import { toolCommandsRule } from "../../src/linter/rules/tool-commands.js";
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

  it("preserves example field on relatedHandoffTypes entries", () => {
    const dsl = DslSchema.parse({
      version: 1,
      system: { id: "s", name: "S", default_workflow_order: ["impl"] },
      agents: {
        a1: {
          role_name: "R",
          purpose: "P",
          can_return_handoffs: ["ht-with-ex", "ht-without-ex"],
        },
      },
      handoff_types: {
        "ht-with-ex": {
          version: 1,
          payload: { type: "object", properties: { x: { type: "string" } } },
          example: { x: "hello" },
        },
        "ht-without-ex": {
          version: 1,
          payload: { type: "object", properties: { y: { type: "number" } } },
        },
      },
    });
    const agent = { ...dsl.agents["a1"], id: "a1" };
    const ctx = buildPerAgentContext(dsl, agent);
    expect(ctx.relatedHandoffTypes["ht-with-ex"].example).toEqual({ x: "hello" });
    expect(ctx.relatedHandoffTypes["ht-without-ex"].example).toBeUndefined();
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

  it("renders relatedArtifacts / relatedTools / relatedHandoffTypes sections via notEmpty helper", async () => {
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

    expect(content).toContain("## Related Artifacts");
    expect(content).toContain("**spec-md**");
    expect(content).toContain("## Available Tools");
    expect(content).toContain("**gh-pr-inspect**");
    expect(content).toContain("## Handoff Types");
    expect(content).toContain("### evidence-gate-verdict (v1)");
  });

  it("omits relatedArtifacts section when agent has no related artifacts", async () => {
    const dsl = DslSchema.parse({
      version: 1,
      system: { id: "s", name: "S", default_workflow_order: ["impl"] },
      agents: { a1: { role_name: "R", purpose: "P" } },
    });
    const targets: ResolvedRenderTarget[] = [
      agentTarget(
        join(templateDir, "agent-prompt.md.hbs"),
        join(outputDir, "{agent.id}.md"),
      ),
    ];
    const files = await renderFromConfig(dsl, targets);
    const content = readFileSync(files[0], "utf8");
    expect(content).not.toContain("## Related Artifacts");
    expect(content).not.toContain("## Available Tools");
    expect(content).not.toContain("## Handoff Types");
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

describe("generateSequenceDiagram", () => {
  it("generates valid mermaid structure from fixture DSL", () => {
    const ctx = buildWorkflowContext(fullDsl, "implement");
    const output = generateSequenceDiagram(ctx.workflow, ctx.relatedTasks, fullDsl);

    expect(output).toContain("sequenceDiagram");
    expect(output).toContain("participant");
    expect(output).toContain("rect ");
    expect(output).toContain("Note over ");
  });

  it("emits [R] for reads_artifact and [W] for produces_artifact", () => {
    const ctx = buildWorkflowContext(fullDsl, "implement");
    const output = generateSequenceDiagram(ctx.workflow, ctx.relatedTasks, fullDsl);

    expect(output).toContain("[R] Read spec-md");
    expect(output).toContain("[W] Change codebase");
  });

  it("emits tool invocation arrows from uses_tool", () => {
    const ctx = buildWorkflowContext(fullDsl, "implement");
    const output = generateSequenceDiagram(ctx.workflow, ctx.relatedTasks, fullDsl);

    expect(output).toContain("eslint_runner");
    expect(output).toContain("Change codebase");
  });

  it("emits delegation and result_handoff arrows", () => {
    const ctx = buildWorkflowContext(fullDsl, "implement");
    const output = generateSequenceDiagram(ctx.workflow, ctx.relatedTasks, fullDsl);

    expect(output).toContain("delegate implement-feature");
    expect(output).toContain("dependency-evidence");
  });

  it("emits validation step with executor and target_artifact", () => {
    const ctx = buildWorkflowContext(fullDsl, "implement");
    const output = generateSequenceDiagram(ctx.workflow, ctx.relatedTasks, fullDsl);

    expect(output).toContain("code-lint");
    expect(output).toContain("[R] codebase");
  });

  it("emits alt/else for decision step", () => {
    const ctx = buildWorkflowContext(fullDsl, "implement");
    const output = generateSequenceDiagram(ctx.workflow, ctx.relatedTasks, fullDsl);

    expect(output).toContain("alt PASS");
    expect(output).toContain("else BLOCK");
    expect(output).toMatch(/end/);
  });

  it("groups participants into Agents, Toolchain, Artifacts boxes", () => {
    const ctx = buildWorkflowContext(fullDsl, "implement");
    const output = generateSequenceDiagram(ctx.workflow, ctx.relatedTasks, fullDsl);

    expect(output).toContain("box rgb(200,220,255) Agents");
    expect(output).toContain("box rgb(220,255,220) Toolchain");
    expect(output).toContain("box rgb(255,230,210) Artifacts");
  });

  it("includes description in workflow Note when present", () => {
    const dsl = DslSchema.parse({
      version: 1,
      system: { id: "s", name: "S", default_workflow_order: ["build"] },
      agents: {
        dev: { role_name: "Developer", purpose: "P", can_write_artifacts: ["code"], can_return_handoffs: ["result"] },
      },
      tasks: {
        "write-code": {
          description: "Write code",
          target_agent: "dev",
          allowed_from_agents: ["dev"],
          workflow: "build",
          input_artifacts: [],
          invocation_handoff: "start",
          result_handoff: "result",
          execution_steps: [
            { id: "w", action: "Write files", produces_artifact: "code" },
          ],
        },
      },
      artifacts: {
        code: { type: "code", owner: "dev", producers: ["dev"], editors: ["dev"], consumers: [], states: ["done"] },
      },
      workflow: {
        build: {
          steps: [
            { type: "handoff", handoff_kind: "delegation", task: "write-code", from_agent: "dev" },
          ],
          description: "Build phase summary",
        },
      },
    });
    const ctx = buildWorkflowContext(dsl, "build");
    const output = generateSequenceDiagram(ctx.workflow, ctx.relatedTasks, dsl);
    expect(output).toContain("build — Build phase summary");
  });

  it("handles handoff step without task (task-less handoff)", () => {
    const dsl = DslSchema.parse({
      version: 1,
      system: { id: "s", name: "S", default_workflow_order: ["flow"] },
      agents: {
        mgr: { role_name: "Manager", purpose: "P" },
      },
      workflow: {
        flow: {
          steps: [
            { type: "handoff", handoff_kind: "notify", from_agent: "mgr" },
          ],
        },
      },
    });
    const ctx = buildWorkflowContext(dsl, "flow");
    const output = generateSequenceDiagram(ctx.workflow, ctx.relatedTasks, dsl);
    expect(output).toContain("sequenceDiagram");
    expect(output).toContain("notify");
  });

  it("emits external_participants as actor/participant in External box", () => {
    const dsl = DslSchema.parse({
      version: 1,
      system: { id: "s", name: "S", default_workflow_order: ["flow"] },
      agents: {
        dev: { role_name: "Developer", purpose: "P", can_return_handoffs: ["result"] },
      },
      tasks: {
        "do-work": {
          description: "Work",
          target_agent: "dev",
          allowed_from_agents: ["dev"],
          workflow: "flow",
          input_artifacts: [],
          invocation_handoff: "start",
          result_handoff: "result",
        },
      },
      workflow: {
        flow: {
          trigger: "User requests work",
          external_participants: [
            { id: "user", kind: "actor", label: "User", description: "Requester" },
            { id: "ta", kind: "participant", label: "Tech Advisory" },
          ],
          steps: [
            { type: "handoff", handoff_kind: "delegation", task: "do-work", from_agent: "dev" },
          ],
        },
      },
    });
    const ctx = buildWorkflowContext(dsl, "flow");
    const output = generateSequenceDiagram(ctx.workflow, ctx.relatedTasks, dsl);
    expect(output).toContain("box rgb(255,245,230) External");
    expect(output).toContain("actor user as User");
    expect(output).toContain("participant ta as Tech Advisory");
    expect(output).toContain("user->>"); // trigger arrow
  });

  it("emits opt block for retry on handoff step", () => {
    const ctx = buildWorkflowContext(fullDsl, "implement");
    const output = generateSequenceDiagram(ctx.workflow, ctx.relatedTasks, fullDsl);
    expect(output).toContain("opt Lint failures found");
    expect(output).toContain("fix implement-feature");
  });

  it("emits par block for grouped steps", () => {
    const dsl = DslSchema.parse({
      version: 1,
      system: { id: "s", name: "S", default_workflow_order: ["audit"] },
      agents: {
        arch: { role_name: "Architect", purpose: "P", can_invoke_agents: ["pol1", "pol2"] },
        pol1: { role_name: "Police A", purpose: "P", mode: "read-only", can_return_handoffs: ["result"] },
        pol2: { role_name: "Police B", purpose: "P", mode: "read-only", can_return_handoffs: ["result"] },
      },
      tasks: {
        "audit-a": {
          description: "A",
          target_agent: "pol1",
          allowed_from_agents: ["arch"],
          workflow: "audit",
          input_artifacts: [],
          invocation_handoff: "delegation",
          result_handoff: "result",
        },
        "audit-b": {
          description: "B",
          target_agent: "pol2",
          allowed_from_agents: ["arch"],
          workflow: "audit",
          input_artifacts: [],
          invocation_handoff: "delegation",
          result_handoff: "result",
        },
      },
      workflow: {
        audit: {
          steps: [
            { type: "handoff", handoff_kind: "delegation", task: "audit-a", from_agent: "arch", group: "police-audit" },
            { type: "handoff", handoff_kind: "delegation", task: "audit-b", from_agent: "arch", group: "police-audit" },
          ],
        },
      },
    });
    const ctx = buildWorkflowContext(dsl, "audit");
    const output = generateSequenceDiagram(ctx.workflow, ctx.relatedTasks, dsl);
    expect(output).toContain("par police-audit");
    expect(output).toContain("and");
    expect(output).toContain("box rgb(255,220,220) Audit");
  });

  it("separates read-only agents into Audit box", () => {
    const dsl = DslSchema.parse({
      version: 1,
      system: { id: "s", name: "S", default_workflow_order: ["check"] },
      agents: {
        mgr: { role_name: "Manager", purpose: "P", can_invoke_agents: ["auditor"] },
        auditor: { role_name: "Auditor", purpose: "P", mode: "read-only", can_return_handoffs: ["result"] },
      },
      tasks: {
        "run-audit": {
          description: "Audit",
          target_agent: "auditor",
          allowed_from_agents: ["mgr"],
          workflow: "check",
          input_artifacts: [],
          invocation_handoff: "delegation",
          result_handoff: "result",
        },
      },
      workflow: {
        check: {
          steps: [
            { type: "handoff", handoff_kind: "delegation", task: "run-audit", from_agent: "mgr" },
          ],
        },
      },
    });
    const ctx = buildWorkflowContext(dsl, "check");
    const output = generateSequenceDiagram(ctx.workflow, ctx.relatedTasks, dsl);
    expect(output).toContain("box rgb(200,220,255) Agents");
    expect(output).toContain("box rgb(255,220,220) Audit");
  });
});

describe("generateOverviewFlowchart", () => {
  it("generates Agent/Artifact/Tool × Phase matrix tables", () => {
    const output = generateOverviewFlowchart(fullDsl);
    expect(output).toContain("#### Agent × Phase");
    expect(output).toContain("#### Artifact × Phase");
    expect(output).toContain("#### Tool × Phase");
    expect(output).toContain("implement");
  });

  it("shows operation types (delegate, execute, R, W, V) in cells", () => {
    const output = generateOverviewFlowchart(fullDsl);
    expect(output).toContain("delegate");
    expect(output).toContain("execute");
    expect(output).toMatch(/\bR\b/);
    expect(output).toMatch(/\bW\b/);
  });
});

describe("linter: artifact-ownership", () => {
  it("warns when agent produces artifact but is not in producers/editors", () => {
    const dsl = DslSchema.parse({
      version: 1,
      system: { id: "s", name: "S", default_workflow_order: ["w"] },
      agents: {
        dev: { role_name: "Dev", purpose: "P", can_write_artifacts: ["doc"], can_return_handoffs: ["r"] },
      },
      tasks: {
        "write-doc": {
          description: "Write doc",
          target_agent: "dev",
          allowed_from_agents: ["dev"],
          workflow: "w",
          input_artifacts: [],
          invocation_handoff: "start",
          result_handoff: "r",
          execution_steps: [
            { id: "s1", action: "Write", produces_artifact: "doc" },
          ],
        },
      },
      artifacts: {
        doc: { type: "document", owner: "other", producers: ["other"], editors: [], consumers: [], states: ["draft"] },
      },
      workflow: { w: { steps: [] } },
    });
    const diagnostics = artifactOwnershipRule.run(dsl);
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0].ruleId).toBe("artifact-ownership");
    expect(diagnostics[0].message).toContain("produces artifact");
  });
});

describe("linter: tool-commands", () => {
  it("errors when command reads non-existent artifact", () => {
    const dsl = DslSchema.parse({
      version: 1,
      system: { id: "s", name: "S", default_workflow_order: ["w"] },
      agents: {
        dev: { role_name: "Dev", purpose: "P", can_execute_tools: ["t1"] },
      },
      tools: {
        t1: {
          kind: "cli",
          invokable_by: ["dev"],
          commands: [
            { command: "run", category: "verification", reads: ["nonexistent"], writes: [] },
          ],
        },
      },
      workflow: { w: { steps: [] } },
    });
    const diagnostics = toolCommandsRule.run(dsl);
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0].ruleId).toBe("tool-commands");
    expect(diagnostics[0].message).toContain("nonexistent");
  });

  it("warns when command writes artifact not in output_artifacts", () => {
    const dsl = DslSchema.parse({
      version: 1,
      system: { id: "s", name: "S", default_workflow_order: ["w"] },
      agents: {
        dev: { role_name: "Dev", purpose: "P", can_execute_tools: ["t1"] },
      },
      artifacts: {
        report: { type: "report", owner: "dev", producers: ["dev"], editors: [], consumers: [], states: ["done"] },
      },
      tools: {
        t1: {
          kind: "cli",
          invokable_by: ["dev"],
          output_artifacts: [],
          commands: [
            { command: "gen", category: "generation", reads: [], writes: ["report"] },
          ],
        },
      },
      workflow: { w: { steps: [] } },
    });
    const diagnostics = toolCommandsRule.run(dsl);
    const writeWarning = diagnostics.find((d: { message: string }) => d.message.includes("output_artifacts"));
    expect(writeWarning).toBeDefined();
  });
});
