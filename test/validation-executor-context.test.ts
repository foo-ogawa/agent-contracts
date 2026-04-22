import { describe, it, expect } from "vitest";
import { DslSchema, type Dsl } from "../src/schema/index.js";
import { lint } from "../src/linter/linter.js";
import { validationExecutorNoContextRule } from "../src/linter/rules/validation-executor-no-context.js";
import { resolveEntityValidations } from "../src/renderer/context.js";

function makeDsl(partial: Partial<Record<string, unknown>>): Dsl {
  return DslSchema.parse({
    version: 1,
    system: { id: "s", name: "S", default_workflow_order: ["implement"] },
    ...partial,
  });
}

describe("resolveEntityValidations", () => {
  it("resolves tool validations in stable id order", () => {
    const dsl = makeDsl({
      agents: { a1: { role_name: "R", purpose: "P" } },
      tools: { t1: { kind: "cli", invokable_by: ["a1"] } },
      validations: {
        zlast: {
          target_artifact: "x",
          kind: "mechanical",
          executor_type: "tool",
          executor: "t1",
          blocking: true,
        },
        afirst: {
          target_artifact: "x",
          kind: "mechanical",
          executor_type: "tool",
          executor: "t1",
          blocking: false,
        },
      },
    });
    const entries = resolveEntityValidations(dsl, "tools", "t1");
    expect(entries.map((e) => e.validation_id)).toEqual(["afirst", "zlast"]);
  });
});

describe("validation-executor-no-context lint rule", () => {
  it("warns when agent executor exists but can_perform_validations omits the validation", () => {
    const dsl = makeDsl({
      agents: { reviewer: { role_name: "R", purpose: "P", can_perform_validations: [] } },
      validations: {
        "code-review": {
          target_artifact: "source-code",
          kind: "semantic",
          executor_type: "agent",
          executor: "reviewer",
          blocking: true,
        },
      },
    });
    const diags = validationExecutorNoContextRule.run(dsl);
    expect(diags).toHaveLength(1);
    expect(diags[0].severity).toBe("warning");
    expect(diags[0].ruleId).toBe("validation-executor-no-context");
    expect(diags[0].path).toBe("agents.reviewer.can_perform_validations");
  });

  it("is clean when the agent lists the validation in can_perform_validations", () => {
    const dsl = makeDsl({
      agents: {
        reviewer: { role_name: "R", purpose: "P", can_perform_validations: ["code-review"] },
      },
      validations: {
        "code-review": {
          target_artifact: "source-code",
          kind: "semantic",
          executor_type: "agent",
          executor: "reviewer",
          blocking: true,
        },
      },
    });
    const diags = validationExecutorNoContextRule.run(dsl);
    expect(diags).toHaveLength(0);
  });

  it("warns when tool executor is not defined in tools", () => {
    const dsl = makeDsl({
      agents: { a1: { role_name: "R", purpose: "P" } },
      tools: { t1: { kind: "cli", invokable_by: ["a1"] } },
      validations: {
        "gate": {
          target_artifact: "x",
          kind: "mechanical",
          executor_type: "tool",
          executor: "no-such-tool",
          blocking: true,
        },
      },
    });
    const diags = validationExecutorNoContextRule.run(dsl);
    expect(diags).toHaveLength(1);
    expect(diags[0].path).toBe("validations.gate.executor");
  });

  it("is clean for tool executor when the tool exists", () => {
    const dsl = makeDsl({
      agents: { a1: { role_name: "R", purpose: "P" } },
      tools: { t1: { kind: "cli", invokable_by: ["a1"] } },
      validations: {
        "gate": {
          target_artifact: "x",
          kind: "mechanical",
          executor_type: "tool",
          executor: "t1",
          blocking: true,
        },
      },
    });
    const diags = validationExecutorNoContextRule.run(dsl);
    expect(diags).toHaveLength(0);
  });
});

describe("lint() integration", () => {
  it("includes validation-executor-no-context when agent wiring is wrong", () => {
    const dsl = makeDsl({
      agents: { reviewer: { role_name: "R", purpose: "P", can_perform_validations: [] } },
      validations: {
        v1: {
          target_artifact: "a",
          kind: "mechanical",
          executor_type: "agent",
          executor: "reviewer",
          blocking: false,
        },
      },
    });
    const diags = lint(dsl);
    expect(diags.some((d) => d.ruleId === "validation-executor-no-context")).toBe(true);
  });
});
