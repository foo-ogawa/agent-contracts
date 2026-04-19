import { describe, it, expect } from "vitest";
import { DslSchema, type Dsl } from "../../src/schema/index.js";
import { semanticValidationPhaseCoverageRule } from "../../src/linter/rules/semantic-validation-phase-coverage.js";

function makeDsl(partial: Partial<Record<string, unknown>>): Dsl {
  return DslSchema.parse({
    version: 1,
    system: { id: "s", name: "S", default_workflow_order: ["specify", "plan", "implement", "audit"] },
    ...partial,
  });
}

describe("semanticValidationPhaseCoverageRule", () => {
  it("warns when semantic validations only appear in late phases", () => {
    const dsl = makeDsl({
      agents: { a1: { role_name: "R", purpose: "P", can_return_handoffs: ["h", "r"] } },
      artifacts: {
        art1: { type: "doc", owner: "a1", producers: ["a1"], editors: ["a1"], consumers: ["a1"], states: ["draft"] },
      },
      validations: {
        "sem-review": { target_artifact: "art1", kind: "semantic", executor_type: "agent", executor: "a1", blocking: true },
      },
      workflow: {
        audit: { steps: [{ type: "validation", validation: "sem-review" }] },
      },
    });
    const diags = semanticValidationPhaseCoverageRule.run(dsl);
    expect(diags.length).toBe(1);
    expect(diags[0].severity).toBe("warning");
    expect(diags[0].ruleId).toBe("semantic-validation-phase-coverage");
    expect(diags[0].message).toContain("audit");
    expect(diags[0].message).toContain("specify");
  });

  it("warns when fidelity validations only appear in late phases", () => {
    const dsl = makeDsl({
      agents: { a1: { role_name: "R", purpose: "P", can_return_handoffs: ["h", "r"] } },
      artifacts: {
        art1: { type: "code", owner: "a1", producers: ["a1"], editors: ["a1"], consumers: ["a1"], states: ["draft"] },
      },
      validations: {
        "fidelity-check": { target_artifact: "art1", kind: "fidelity", executor_type: "agent", executor: "a1", blocking: true },
      },
      workflow: {
        audit: { steps: [{ type: "validation", validation: "fidelity-check" }] },
      },
    });
    const diags = semanticValidationPhaseCoverageRule.run(dsl);
    expect(diags.length).toBe(1);
    expect(diags[0].message).toContain("audit");
    expect(diags[0].message).toContain("specify");
  });

  it("passes when semantic validations appear in early phases", () => {
    const dsl = makeDsl({
      agents: { a1: { role_name: "R", purpose: "P", can_return_handoffs: ["h", "r"] } },
      artifacts: {
        art1: { type: "doc", owner: "a1", producers: ["a1"], editors: ["a1"], consumers: ["a1"], states: ["draft"] },
      },
      validations: {
        "sem-review": { target_artifact: "art1", kind: "semantic", executor_type: "agent", executor: "a1", blocking: true },
      },
      workflow: {
        specify: { steps: [{ type: "validation", validation: "sem-review" }] },
      },
    });
    const diags = semanticValidationPhaseCoverageRule.run(dsl);
    expect(diags).toHaveLength(0);
  });

  it("passes when semantic validations appear in both early and late phases", () => {
    const dsl = makeDsl({
      agents: { a1: { role_name: "R", purpose: "P", can_return_handoffs: ["h", "r"] } },
      artifacts: {
        art1: { type: "doc", owner: "a1", producers: ["a1"], editors: ["a1"], consumers: ["a1"], states: ["draft"] },
      },
      validations: {
        "sem-review": { target_artifact: "art1", kind: "semantic", executor_type: "agent", executor: "a1", blocking: true },
      },
      workflow: {
        plan: { steps: [{ type: "validation", validation: "sem-review" }] },
        audit: { steps: [{ type: "validation", validation: "sem-review" }] },
      },
    });
    const diags = semanticValidationPhaseCoverageRule.run(dsl);
    expect(diags).toHaveLength(0);
  });

  it("passes when no semantic or fidelity validations exist", () => {
    const dsl = makeDsl({
      agents: { a1: { role_name: "R", purpose: "P" } },
      artifacts: {
        art1: { type: "code", owner: "a1", producers: ["a1"], editors: ["a1"], consumers: ["a1"], states: ["draft"] },
      },
      validations: {
        "lint-check": { target_artifact: "art1", kind: "mechanical", executor_type: "tool", executor: "t1", blocking: true },
      },
    });
    const diags = semanticValidationPhaseCoverageRule.run(dsl);
    expect(diags).toHaveLength(0);
  });

  it("passes when workflow order has fewer than 2 phases", () => {
    const dsl = DslSchema.parse({
      version: 1,
      system: { id: "s", name: "S", default_workflow_order: ["implement"] },
      validations: {
        "sem-review": { target_artifact: "art1", kind: "semantic", executor_type: "agent", executor: "a1", blocking: true },
      },
    });
    const diags = semanticValidationPhaseCoverageRule.run(dsl);
    expect(diags).toHaveLength(0);
  });

  it("detects semantic validations referenced via task.validations in late phase", () => {
    const dsl = makeDsl({
      agents: { a1: { role_name: "R", purpose: "P", can_return_handoffs: ["h", "r"] } },
      artifacts: {
        art1: { type: "doc", owner: "a1", producers: ["a1"], editors: ["a1"], consumers: ["a1"], states: ["draft"] },
      },
      validations: {
        "sem-review": { target_artifact: "art1", kind: "semantic", executor_type: "agent", executor: "a1", blocking: true },
      },
      tasks: {
        t1: {
          description: "d", target_agent: "a1", allowed_from_agents: ["a1"],
          workflow: "audit", input_artifacts: [], invocation_handoff: "h", result_handoff: "r",
          validations: ["sem-review"],
        },
      },
      handoff_types: { h: { version: 1, schema: {} }, r: { version: 1, schema: {} } },
    });
    const diags = semanticValidationPhaseCoverageRule.run(dsl);
    expect(diags.length).toBe(1);
    expect(diags[0].message).toContain("audit");
  });

  it("passes when semantic validation is in task assigned to early phase", () => {
    const dsl = makeDsl({
      agents: { a1: { role_name: "R", purpose: "P", can_return_handoffs: ["h", "r"] } },
      artifacts: {
        art1: { type: "doc", owner: "a1", producers: ["a1"], editors: ["a1"], consumers: ["a1"], states: ["draft"] },
      },
      validations: {
        "sem-review": { target_artifact: "art1", kind: "semantic", executor_type: "agent", executor: "a1", blocking: true },
      },
      tasks: {
        t1: {
          description: "d", target_agent: "a1", allowed_from_agents: ["a1"],
          workflow: "specify", input_artifacts: [], invocation_handoff: "h", result_handoff: "r",
          validations: ["sem-review"],
        },
      },
      handoff_types: { h: { version: 1, schema: {} }, r: { version: 1, schema: {} } },
    });
    const diags = semanticValidationPhaseCoverageRule.run(dsl);
    expect(diags).toHaveLength(0);
  });

  it("handles provenance and traceability kinds without triggering this rule", () => {
    const dsl = makeDsl({
      agents: { a1: { role_name: "R", purpose: "P" } },
      artifacts: {
        art1: { type: "code", owner: "a1", producers: ["a1"], editors: ["a1"], consumers: ["a1"], states: ["draft"] },
      },
      validations: {
        "prov-check": { target_artifact: "art1", kind: "provenance", executor_type: "tool", executor: "t1", blocking: true },
        "trace-check": { target_artifact: "art1", kind: "traceability", executor_type: "tool", executor: "t1", blocking: true },
      },
      workflow: {
        audit: { steps: [
          { type: "validation", validation: "prov-check" },
          { type: "validation", validation: "trace-check" },
        ] },
      },
    });
    const diags = semanticValidationPhaseCoverageRule.run(dsl);
    expect(diags).toHaveLength(0);
  });
});
