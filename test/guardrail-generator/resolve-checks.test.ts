import { describe, it, expect } from "vitest";
import {
  DslSchema,
  type Dsl,
  type SoftwareBinding,
  type GuardrailPolicy,
} from "../../src/schema/index.js";
import { resolveChecks } from "../../src/guardrail-generator/resolve-checks.js";

function makeDsl(overrides: Partial<Dsl>): Dsl {
  return DslSchema.parse({
    version: 1,
    system: { id: "sys", name: "Sys", default_workflow_order: [] },
    agents: {},
    tasks: {},
    artifacts: {},
    tools: {},
    validations: {},
    handoff_types: {},
    workflow: {},
    policies: {},
    guardrails: {},
    guardrail_policies: {},
    components: { schemas: {} },
    ...overrides,
  });
}

describe("resolveChecks", () => {
  it("returns resolved checks when guardrail exists in DSL and policy has matching rule", () => {
    const dsl = makeDsl({
      guardrails: {
        g1: { description: "d", scope: {}, tags: [] },
      },
    });
    const binding: SoftwareBinding = {
      software: "cursor",
      version: 1,
      guardrail_impl: {
        g1: { checks: [{ message: "c1" }, { message: "c2" }] },
      },
    };
    const policy: GuardrailPolicy = {
      rules: [
        {
          guardrail: "g1",
          severity: "mandatory",
          action: "warn",
        },
      ],
    };
    const { resolved, diagnostics } = resolveChecks(dsl, binding, policy);
    expect(diagnostics).toEqual([]);
    expect(resolved).toHaveLength(2);
    expect(resolved[0].guardrail_id).toBe("g1");
    expect(resolved[0].guardrail).toEqual(dsl.guardrails.g1);
    expect(resolved[0].policy_rule.guardrail).toBe("g1");
    expect(resolved[0].check).toEqual({ message: "c1" });
    expect(resolved[1].check).toEqual({ message: "c2" });
  });

  it("returns error diagnostic when binding implements a guardrail not in DSL", () => {
    const dsl = makeDsl({});
    const binding: SoftwareBinding = {
      software: "cursor",
      version: 1,
      guardrail_impl: {
        unknown: { checks: [{ message: "x" }] },
      },
    };
    const policy: GuardrailPolicy = {
      rules: [{ guardrail: "unknown", severity: "info", action: "info" }],
    };
    const { resolved, diagnostics } = resolveChecks(dsl, binding, policy);
    expect(resolved).toEqual([]);
    expect(diagnostics).toEqual([
      {
        path: "binding.cursor.guardrail_impl.unknown",
        message:
          'Binding "cursor" implements guardrail "unknown" which is not defined in the DSL',
        severity: "error",
      },
    ]);
  });

  it("returns info diagnostic when guardrail has no policy rule", () => {
    const dsl = makeDsl({
      guardrails: {
        g1: { description: "d", scope: {}, tags: [] },
      },
    });
    const binding: SoftwareBinding = {
      software: "cursor",
      version: 1,
      guardrail_impl: {
        g1: { checks: [{ message: "x" }] },
      },
    };
    const policy: GuardrailPolicy = {
      rules: [],
    };
    const { resolved, diagnostics } = resolveChecks(dsl, binding, policy);
    expect(resolved).toEqual([]);
    expect(diagnostics).toEqual([
      {
        path: "binding.cursor.guardrail_impl.g1",
        message:
          'Guardrail "g1" has no policy rule in the active policy — skipping',
        severity: "info",
      },
    ]);
  });

  it("maps each check in impl.checks to a ResolvedCheck", () => {
    const dsl = makeDsl({
      guardrails: {
        g1: { description: "d", scope: {}, tags: [] },
      },
    });
    const binding: SoftwareBinding = {
      software: "x",
      version: 1,
      guardrail_impl: {
        g1: {
          checks: [{ script: "a" }, { script: "b" }, { script: "c" }],
        },
      },
    };
    const policy: GuardrailPolicy = {
      rules: [{ guardrail: "g1", severity: "critical", action: "block" }],
    };
    const { resolved } = resolveChecks(dsl, binding, policy);
    expect(resolved.map((r) => r.check)).toEqual([
      { script: "a" },
      { script: "b" },
      { script: "c" },
    ]);
  });

  it("returns empty resolved and no diagnostics when guardrail_impl is absent", () => {
    const dsl = makeDsl({
      guardrails: {
        g1: { description: "d", scope: {}, tags: [] },
      },
    });
    const binding: SoftwareBinding = {
      software: "cursor",
      version: 1,
    };
    const policy: GuardrailPolicy = {
      rules: [{ guardrail: "g1", severity: "warning", action: "warn" }],
    };
    expect(resolveChecks(dsl, binding, policy)).toEqual({
      resolved: [],
      diagnostics: [],
    });
  });

  it("handles mix of valid guardrails, missing from DSL, and missing policy rules", () => {
    const dsl = makeDsl({
      guardrails: {
        in_dsl_with_policy: { description: "a", scope: {}, tags: [] },
        in_dsl_no_policy: { description: "b", scope: {}, tags: [] },
      },
    });
    const binding: SoftwareBinding = {
      software: "ide",
      version: 1,
      guardrail_impl: {
        in_dsl_with_policy: { checks: [{ message: "ok" }] },
        not_in_dsl: { checks: [{ message: "n" }] },
        in_dsl_no_policy: { checks: [{ message: "skip" }] },
      },
    };
    const policy: GuardrailPolicy = {
      rules: [
        {
          guardrail: "in_dsl_with_policy",
          severity: "mandatory",
          action: "warn",
        },
      ],
    };
    const { resolved, diagnostics } = resolveChecks(dsl, binding, policy);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].guardrail_id).toBe("in_dsl_with_policy");
    expect(diagnostics).toEqual(
      expect.arrayContaining([
        {
          path: "binding.ide.guardrail_impl.not_in_dsl",
          message:
            'Binding "ide" implements guardrail "not_in_dsl" which is not defined in the DSL',
          severity: "error",
        },
        {
          path: "binding.ide.guardrail_impl.in_dsl_no_policy",
          message:
            'Guardrail "in_dsl_no_policy" has no policy rule in the active policy — skipping',
          severity: "info",
        },
      ]),
    );
    expect(diagnostics).toHaveLength(2);
  });
});
