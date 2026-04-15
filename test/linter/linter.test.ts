import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { parse as parseYaml } from "yaml";
import { describe, it, expect } from "vitest";
import { DslSchema, type Dsl } from "../../src/schema/index.js";
import { lint } from "../../src/linter/linter.js";
import { validationCoverageRule } from "../../src/linter/rules/validation-coverage.js";
import { toolExecutionRule } from "../../src/linter/rules/tool-execution.js";
import { taskAgentBindingRule } from "../../src/linter/rules/task-agent-binding.js";
import { mergeIntegrityRule } from "../../src/linter/rules/merge-integrity.js";

const fixturesDir = resolve(import.meta.dirname, "../fixtures");

function loadDsl(rel: string): Dsl {
  const data = parseYaml(readFileSync(join(fixturesDir, rel), "utf8"));
  return DslSchema.parse(data);
}

function makeDsl(partial: Partial<Record<string, unknown>>): Dsl {
  return DslSchema.parse({
    version: 1,
    system: { id: "s", name: "S", default_workflow_order: ["implement"] },
    ...partial,
  });
}

describe("validationCoverageRule", () => {
  it("warns when artifact has no validations", () => {
    const dsl = makeDsl({
      agents: { a1: { role_name: "R", purpose: "P" } },
      artifacts: {
        art1: { type: "code", owner: "a1", producers: ["a1"], editors: ["a1"], consumers: ["a1"], states: ["draft"] },
      },
    });
    const diags = validationCoverageRule.run(dsl);
    expect(diags.length).toBeGreaterThan(0);
    expect(diags[0].severity).toBe("warning");
    expect(diags[0].message).toContain("no validations");
  });

  it("warns when code artifact lacks mechanical validation", () => {
    const dsl = makeDsl({
      agents: { a1: { role_name: "R", purpose: "P" } },
      artifacts: {
        art1: { type: "code", owner: "a1", producers: ["a1"], editors: ["a1"], consumers: ["a1"], states: ["draft"] },
      },
      validations: {
        v1: { target_artifact: "art1", kind: "approval", executor_type: "agent", executor: "a1", blocking: true },
      },
    });
    const diags = validationCoverageRule.run(dsl);
    expect(diags.some((d) => d.message.includes("mechanical"))).toBe(true);
  });

  it("passes when artifact has mechanical validation", () => {
    const dsl = makeDsl({
      agents: { a1: { role_name: "R", purpose: "P" } },
      artifacts: {
        art1: { type: "code", owner: "a1", producers: ["a1"], editors: ["a1"], consumers: ["a1"], states: ["draft"] },
      },
      validations: {
        v1: { target_artifact: "art1", kind: "mechanical", executor_type: "tool", executor: "t1", blocking: true },
      },
      tools: { t1: { kind: "cli", invokable_by: ["a1"] } },
      workflow: { implement: { steps: [{ type: "validation", validation: "v1" }] } },
    });
    const diags = validationCoverageRule.run(dsl);
    expect(diags).toHaveLength(0);
  });

  it("warns when blocking validation is not referenced in workflow", () => {
    const dsl = makeDsl({
      agents: { a1: { role_name: "R", purpose: "P" } },
      artifacts: {
        art1: { type: "doc", owner: "a1", producers: ["a1"], editors: ["a1"], consumers: ["a1"], states: ["draft"] },
      },
      validations: {
        v1: { target_artifact: "art1", kind: "approval", executor_type: "agent", executor: "a1", blocking: true },
      },
    });
    const diags = validationCoverageRule.run(dsl);
    expect(diags.some((d) => d.message.includes("Blocking validation") && d.message.includes("not referenced"))).toBe(true);
  });

  it("passes when blocking validation is referenced in workflow", () => {
    const dsl = makeDsl({
      agents: { a1: { role_name: "R", purpose: "P" } },
      artifacts: {
        art1: { type: "doc", owner: "a1", producers: ["a1"], editors: ["a1"], consumers: ["a1"], states: ["draft"] },
      },
      validations: {
        v1: { target_artifact: "art1", kind: "approval", executor_type: "agent", executor: "a1", blocking: true },
      },
      workflow: { implement: { steps: [{ type: "validation", validation: "v1" }] } },
    });
    const diags = validationCoverageRule.run(dsl);
    expect(diags.filter((d) => d.message.includes("Blocking validation"))).toHaveLength(0);
  });

  it("passes when blocking validation is referenced in task.validations", () => {
    const dsl = makeDsl({
      agents: { a1: { role_name: "R", purpose: "P", can_return_handoffs: ["h", "r"] } },
      artifacts: {
        art1: { type: "doc", owner: "a1", producers: ["a1"], editors: ["a1"], consumers: ["a1"], states: ["draft"] },
      },
      validations: {
        v1: { target_artifact: "art1", kind: "approval", executor_type: "agent", executor: "a1", blocking: true },
      },
      tasks: {
        t1: {
          description: "d", target_agent: "a1", allowed_from_agents: ["a1"],
          workflow: "implement", input_artifacts: [], invocation_handoff: "h", result_handoff: "r",
          validations: ["v1"],
        },
      },
      handoff_types: {
        h: { version: 1, payload: {} },
        r: { version: 1, payload: {} },
      },
    });
    const diags = validationCoverageRule.run(dsl);
    expect(diags.filter((d) => d.message.includes("Blocking validation"))).toHaveLength(0);
  });
});

describe("toolExecutionRule", () => {
  it("detects can_execute_tools ↔ invokable_by mismatch (agent side)", () => {
    const dsl = makeDsl({
      agents: { a1: { role_name: "R", purpose: "P", can_execute_tools: ["t1"] } },
      tools: { t1: { kind: "cli", invokable_by: [] } },
    });
    const diags = toolExecutionRule.run(dsl);
    expect(diags.some((d) => d.message.includes("invokable_by does not include"))).toBe(true);
  });

  it("detects invokable_by ↔ can_execute_tools mismatch (tool side)", () => {
    const dsl = makeDsl({
      agents: { a1: { role_name: "R", purpose: "P", can_execute_tools: [] } },
      tools: { t1: { kind: "cli", invokable_by: ["a1"] } },
    });
    const diags = toolExecutionRule.run(dsl);
    expect(diags.some((d) => d.message.includes("can_execute_tools does not include"))).toBe(true);
  });

  it("detects execution_steps uses_tool not in agent capabilities", () => {
    const dsl = makeDsl({
      agents: { a1: { role_name: "R", purpose: "P", can_execute_tools: [] } },
      tasks: {
        t1: {
          description: "d", target_agent: "a1", allowed_from_agents: ["a1"],
          workflow: "implement", input_artifacts: [], invocation_handoff: "h", result_handoff: "r",
          execution_steps: [{ id: "s1", action: "Act", uses_tool: "missing-tool" }],
        },
      },
    });
    const diags = toolExecutionRule.run(dsl);
    expect(diags.some((d) => d.message.includes("missing-tool"))).toBe(true);
  });

  it("passes when tools are bidirectionally consistent", () => {
    const dsl = makeDsl({
      agents: { a1: { role_name: "R", purpose: "P", can_execute_tools: ["t1"] } },
      tools: { t1: { kind: "cli", invokable_by: ["a1"] } },
    });
    const diags = toolExecutionRule.run(dsl);
    expect(diags).toHaveLength(0);
  });

  it("detects executor_type=tool validation with no capable agent", () => {
    const dsl = makeDsl({
      agents: { a1: { role_name: "R", purpose: "P", can_execute_tools: [] } },
      artifacts: { art1: { type: "code", owner: "a1", producers: ["a1"], editors: ["a1"], consumers: ["a1"], states: ["draft"] } },
      tools: { "lint-tool": { kind: "cli", invokable_by: [] } },
      validations: {
        v1: { target_artifact: "art1", kind: "mechanical", executor_type: "tool", executor: "lint-tool", blocking: true },
      },
    });
    const diags = toolExecutionRule.run(dsl);
    expect(diags.some((d) => d.message.includes("executor_type=tool") && d.message.includes("no agent"))).toBe(true);
  });

  it("passes executor_type=tool check when agent can execute", () => {
    const dsl = makeDsl({
      agents: { a1: { role_name: "R", purpose: "P", can_execute_tools: ["lint-tool"] } },
      artifacts: { art1: { type: "code", owner: "a1", producers: ["a1"], editors: ["a1"], consumers: ["a1"], states: ["draft"] } },
      tools: { "lint-tool": { kind: "cli", invokable_by: ["a1"] } },
      validations: {
        v1: { target_artifact: "art1", kind: "mechanical", executor_type: "tool", executor: "lint-tool", blocking: true },
      },
    });
    const diags = toolExecutionRule.run(dsl);
    expect(diags.filter((d) => d.message.includes("executor_type=tool"))).toHaveLength(0);
  });
});


describe("taskAgentBindingRule", () => {
  it("detects allowed_from_agents ↔ can_invoke_agents mismatch", () => {
    const dsl = makeDsl({
      agents: {
        caller: { role_name: "C", purpose: "P", can_invoke_agents: [] },
        target: { role_name: "T", purpose: "P" },
      },
      tasks: {
        t1: {
          description: "d", target_agent: "target", allowed_from_agents: ["caller"],
          workflow: "implement", input_artifacts: [], invocation_handoff: "h", result_handoff: "r",
        },
      },
    });
    const diags = taskAgentBindingRule.run(dsl);
    expect(diags.some((d) => d.severity === "error" && d.message.includes("can_invoke_agents"))).toBe(true);
  });

  it("warns when non-dispatch_only agent has no tasks", () => {
    const dsl = makeDsl({
      agents: { a1: { role_name: "R", purpose: "P" } },
    });
    const diags = taskAgentBindingRule.run(dsl);
    expect(diags.some((d) => d.severity === "warning" && d.message.includes("no tasks assigned"))).toBe(true);
  });

  it("skips dispatch_only agents from unassigned check", () => {
    const dsl = makeDsl({
      agents: { a1: { role_name: "R", purpose: "P", dispatch_only: true } },
    });
    const diags = taskAgentBindingRule.run(dsl);
    expect(diags.filter((d) => d.message.includes("no tasks assigned"))).toHaveLength(0);
  });

  it("detects execution_steps.produces_artifact not in agent can_write_artifacts", () => {
    const dsl = makeDsl({
      agents: { a1: { role_name: "R", purpose: "P", can_write_artifacts: [] } },
      artifacts: { art1: { type: "doc", owner: "a1", producers: ["a1"], editors: ["a1"], consumers: ["a1"], states: ["draft"] } },
      tasks: {
        t1: {
          description: "d", target_agent: "a1", allowed_from_agents: ["a1"],
          workflow: "implement", input_artifacts: [], invocation_handoff: "h", result_handoff: "r",
          execution_steps: [{ id: "s1", action: "Act", produces_artifact: "art1" }],
        },
      },
    });
    const diags = taskAgentBindingRule.run(dsl);
    expect(diags.some((d) => d.message.includes("produces_artifact"))).toBe(true);
  });

  it("detects input_artifacts not in target agent can_read_artifacts", () => {
    const dsl = makeDsl({
      agents: {
        a1: { role_name: "R", purpose: "P", can_read_artifacts: [] },
      },
      artifacts: { art1: { type: "doc", owner: "a1", producers: ["a1"], editors: ["a1"], consumers: ["a1"], states: ["draft"] } },
      tasks: {
        t1: {
          description: "d", target_agent: "a1", allowed_from_agents: ["a1"],
          workflow: "implement", input_artifacts: ["art1"], invocation_handoff: "h", result_handoff: "r",
        },
      },
    });
    const diags = taskAgentBindingRule.run(dsl);
    expect(diags.some((d) => d.message.includes("input_artifact") && d.message.includes("can_read_artifacts"))).toBe(true);
  });

  it("detects result_handoff not in target agent can_return_handoffs", () => {
    const dsl = makeDsl({
      agents: {
        a1: { role_name: "R", purpose: "P", can_return_handoffs: ["inv"] },
      },
      tasks: {
        t1: {
          description: "d", target_agent: "a1", allowed_from_agents: ["a1"],
          workflow: "implement", input_artifacts: [], invocation_handoff: "inv", result_handoff: "res",
        },
      },
      handoff_types: {
        inv: { version: 1, payload: {} },
        res: { version: 1, payload: {} },
      },
    });
    const diags = taskAgentBindingRule.run(dsl);
    expect(diags.some((d) => d.message.includes("result_handoff") && d.message.includes("can_return_handoffs"))).toBe(true);
  });

  it("detects uses_tool bidirectional mismatch (tool invokable_by missing target)", () => {
    const dsl = makeDsl({
      agents: { a1: { role_name: "R", purpose: "P", can_execute_tools: ["t1"], can_return_handoffs: ["h", "r"] } },
      tools: { t1: { kind: "cli", invokable_by: [] } },
      tasks: {
        task1: {
          description: "d", target_agent: "a1", allowed_from_agents: ["a1"],
          workflow: "implement", input_artifacts: [], invocation_handoff: "h", result_handoff: "r",
          execution_steps: [{ id: "s1", action: "Act", uses_tool: "t1" }],
        },
      },
      handoff_types: {
        h: { version: 1, payload: {} },
        r: { version: 1, payload: {} },
      },
    });
    const diags = taskAgentBindingRule.run(dsl);
    expect(diags.some((d) => d.message.includes("invokable_by does not include"))).toBe(true);
  });
});

describe("mergeIntegrityRule", () => {
  it("detects duplicate phases in default_workflow_order", () => {
    const dsl = DslSchema.parse({
      version: 1,
      system: { id: "s", name: "S", default_workflow_order: ["implement", "implement"] },
    });
    const diags = mergeIntegrityRule.run(dsl);
    expect(diags.some((d) => d.message.includes("Duplicate workflow"))).toBe(true);
  });

  it("passes when no duplicates exist", () => {
    const dsl = loadDsl("minimal/agent-contracts.yaml");
    const diags = mergeIntegrityRule.run(dsl);
    expect(diags).toHaveLength(0);
  });
});

describe("lint() integration", () => {
  it("runs all builtin rules on full fixture", () => {
    const dsl = loadDsl("full/agent-contracts.yaml");
    const diags = lint(dsl);
    expect(Array.isArray(diags)).toBe(true);
    for (const d of diags) {
      expect(d.ruleId).toBeDefined();
      expect(d.severity).toBeDefined();
      expect(d.message).toBeDefined();
    }
  });

  it("aggregates diagnostics from multiple rules", () => {
    const dsl = makeDsl({
      agents: {
        a1: { role_name: "R", purpose: "P", can_execute_tools: ["t1"] },
      },
      tools: { t1: { kind: "cli", invokable_by: [] } },
      artifacts: {
        art1: { type: "code", owner: "a1", producers: ["a1"], editors: ["a1"], consumers: ["a1"], states: [] },
      },
    });
    const diags = lint(dsl);
    const ruleIds = new Set(diags.map((d) => d.ruleId));
    expect(ruleIds.size).toBeGreaterThanOrEqual(2);
  });
});
