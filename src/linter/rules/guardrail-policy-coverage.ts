import type { Dsl } from "../../schema/index.js";
import type { LintRule, LintDiagnostic } from "../types.js";

export const guardrailPolicyCoverageRule: LintRule = {
  id: "guardrail-no-policy-rule",
  description:
    "Every guardrail should be referenced by at least one policy rule in guardrail_policies",

  run(dsl: Dsl): LintDiagnostic[] {
    const diagnostics: LintDiagnostic[] = [];

    const referencedGuardrails = new Set<string>();
    for (const policy of Object.values(dsl.guardrail_policies)) {
      for (const rule of policy.rules) {
        referencedGuardrails.add(rule.guardrail);
      }
    }

    for (const guardrailId of Object.keys(dsl.guardrails)) {
      if (!referencedGuardrails.has(guardrailId)) {
        diagnostics.push({
          ruleId: "guardrail-no-policy-rule",
          severity: "warning",
          path: `guardrails.${guardrailId}`,
          message: `Guardrail "${guardrailId}" is not referenced by any policy rule in guardrail_policies`,
        });
      }
    }

    return diagnostics;
  },
};
