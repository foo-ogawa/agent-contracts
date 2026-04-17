import { describe, it, expect } from "vitest";
import { DslSchema, type Dsl } from "../../src/schema/index.js";
import { guardrailPolicyCoverageRule } from "../../src/linter/rules/guardrail-policy-coverage.js";

function makeDsl(partial: Partial<Record<string, unknown>>): Dsl {
  return DslSchema.parse({
    version: 1,
    system: { id: "s", name: "S", default_workflow_order: ["implement"] },
    ...partial,
  });
}

describe("guardrailPolicyCoverageRule", () => {
  it("returns no warnings when all guardrails are referenced by policy rules", () => {
    const dsl = makeDsl({
      guardrails: {
        g1: { description: "One", scope: {}, tags: [] },
        g2: { description: "Two", scope: {}, tags: [] },
      },
      guardrail_policies: {
        p1: {
          rules: [
            { guardrail: "g1", severity: "critical", action: "block" },
            { guardrail: "g2", severity: "warning", action: "warn" },
          ],
        },
      },
    });
    expect(guardrailPolicyCoverageRule.run(dsl)).toHaveLength(0);
  });

  it("returns warning for guardrail not referenced by any policy", () => {
    const dsl = makeDsl({
      guardrails: {
        covered: { description: "Covered", scope: {}, tags: [] },
        orphan: { description: "Orphan", scope: {}, tags: [] },
      },
      guardrail_policies: {
        p1: { rules: [{ guardrail: "covered", severity: "critical", action: "block" }] },
      },
    });
    const diags = guardrailPolicyCoverageRule.run(dsl);
    expect(diags).toHaveLength(1);
    expect(diags[0].severity).toBe("warning");
    expect(diags[0].path).toBe("guardrails.orphan");
    expect(diags[0].message).toContain("orphan");
  });

  it("returns warnings for multiple unreferenced guardrails", () => {
    const dsl = makeDsl({
      guardrails: {
        a: { description: "A", scope: {}, tags: [] },
        b: { description: "B", scope: {}, tags: [] },
        c: { description: "C", scope: {}, tags: [] },
      },
      guardrail_policies: {
        p1: { rules: [{ guardrail: "a", severity: "info", action: "info" }] },
      },
    });
    const diags = guardrailPolicyCoverageRule.run(dsl);
    expect(diags).toHaveLength(2);
    const paths = diags.map((d) => d.path).sort();
    expect(paths).toEqual(["guardrails.b", "guardrails.c"]);
  });

  it("returns no warnings when guardrails is empty", () => {
    const dsl = makeDsl({
      guardrail_policies: {
        p1: { rules: [{ guardrail: "ghost", severity: "info", action: "info" }] },
      },
    });
    expect(guardrailPolicyCoverageRule.run(dsl)).toHaveLength(0);
  });

  it("returns no warnings when guardrail_policies is empty but guardrails is also empty", () => {
    const dsl = makeDsl({});
    expect(guardrailPolicyCoverageRule.run(dsl)).toHaveLength(0);
  });

  it("returns warnings when guardrail_policies is empty but guardrails has entries", () => {
    const dsl = makeDsl({
      guardrails: {
        u1: { description: "Unreferenced", scope: {}, tags: [] },
      },
      guardrail_policies: {},
    });
    const diags = guardrailPolicyCoverageRule.run(dsl);
    expect(diags).toHaveLength(1);
    expect(diags[0].path).toBe("guardrails.u1");
  });

  it("treats a guardrail referenced in any policy as covered", () => {
    const dsl = makeDsl({
      guardrails: {
        shared: { description: "Shared", scope: {}, tags: [] },
      },
      guardrail_policies: {
        policy_a: { rules: [] },
        policy_b: { rules: [{ guardrail: "shared", severity: "critical", action: "block" }] },
      },
    });
    expect(guardrailPolicyCoverageRule.run(dsl)).toHaveLength(0);
  });
});
