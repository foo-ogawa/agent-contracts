import { describe, it, expect } from "vitest";
import { DslSchema, type Dsl } from "../../src/schema/index.js";
import { yamlReservedKeySafetyRule } from "../../src/linter/rules/yaml-reserved-key-safety.js";

function makeDsl(partial: Partial<Record<string, unknown>>): Dsl {
  return DslSchema.parse({
    version: 1,
    system: { id: "s", name: "S", default_workflow_order: ["implement"] },
    ...partial,
  });
}

describe("yamlReservedKeySafetyRule", () => {
  it("warns when decision step uses 'on' without 'routing_key'", () => {
    const dsl = makeDsl({
      workflow: {
        implement: {
          steps: [
            {
              type: "decision",
              on: "some-field.verdict",
              branches: { PASS: ["next"], FAIL: ["stop"] },
            },
          ],
        },
      },
    });
    const diags = yamlReservedKeySafetyRule.run(dsl);
    expect(diags).toHaveLength(1);
    expect(diags[0].ruleId).toBe("yaml-reserved-key-safety");
    expect(diags[0].severity).toBe("warning");
    expect(diags[0].path).toBe("workflow.implement.steps[0].on");
    expect(diags[0].message).toContain("routing_key");
  });

  it("does not warn when decision step uses 'routing_key'", () => {
    const dsl = makeDsl({
      workflow: {
        implement: {
          steps: [
            {
              type: "decision",
              routing_key: "some-field.verdict",
              branches: { PASS: ["next"], FAIL: ["stop"] },
            },
          ],
        },
      },
    });
    const diags = yamlReservedKeySafetyRule.run(dsl);
    const onWarnings = diags.filter((d) => d.path.endsWith(".on"));
    expect(onWarnings).toHaveLength(0);
  });

  it("does not warn about 'on' when 'routing_key' is also present", () => {
    const dsl = makeDsl({
      workflow: {
        implement: {
          steps: [
            {
              type: "decision",
              on: "legacy.path",
              routing_key: "some-field.verdict",
              branches: { PASS: ["next"] },
            },
          ],
        },
      },
    });
    const diags = yamlReservedKeySafetyRule.run(dsl);
    const onWarnings = diags.filter((d) => d.path.endsWith(".on"));
    expect(onWarnings).toHaveLength(0);
  });

  it("warns on YAML reserved words in branch keys", () => {
    const dsl = makeDsl({
      workflow: {
        implement: {
          steps: [
            {
              type: "decision",
              routing_key: "field.path",
              branches: { yes: ["a"], no: ["b"] },
            },
          ],
        },
      },
    });
    const diags = yamlReservedKeySafetyRule.run(dsl);
    const branchWarnings = diags.filter((d) => d.path.includes("branches"));
    expect(branchWarnings).toHaveLength(2);
    expect(branchWarnings[0].message).toContain("YAML 1.1 reserved word");
  });

  it("warns on case-insensitive YAML reserved branch keys", () => {
    const dsl = makeDsl({
      workflow: {
        implement: {
          steps: [
            {
              type: "decision",
              routing_key: "field",
              branches: { TRUE: ["a"], FALSE: ["b"], NORMAL: ["c"] },
            },
          ],
        },
      },
    });
    const diags = yamlReservedKeySafetyRule.run(dsl);
    const branchWarnings = diags.filter((d) => d.path.includes("branches"));
    expect(branchWarnings).toHaveLength(2);
  });

  it("returns no warnings when no decision steps exist", () => {
    const dsl = makeDsl({
      workflow: {
        implement: {
          steps: [
            { type: "gate", gate_kind: "evidence-gate" },
          ],
        },
      },
    });
    const diags = yamlReservedKeySafetyRule.run(dsl);
    expect(diags).toHaveLength(0);
  });

  it("scans multiple workflows", () => {
    const dsl = makeDsl({
      workflow: {
        phase1: {
          steps: [
            {
              type: "decision",
              on: "field1",
              branches: { A: ["a"] },
            },
          ],
        },
        phase2: {
          steps: [
            {
              type: "decision",
              on: "field2",
              branches: { B: ["b"] },
            },
          ],
        },
      },
    });
    const diags = yamlReservedKeySafetyRule.run(dsl);
    const onWarnings = diags.filter((d) => d.path.endsWith(".on"));
    expect(onWarnings).toHaveLength(2);
  });
});
