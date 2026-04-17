import type { Dsl, SoftwareBinding, GuardrailPolicy } from "../schema/index.js";
import type { ResolvedCheck, GenerateDiagnostic } from "./types.js";

export interface ResolveChecksResult {
  resolved: ResolvedCheck[];
  diagnostics: GenerateDiagnostic[];
}

export function resolveChecks(
  dsl: Dsl,
  binding: SoftwareBinding,
  policy: GuardrailPolicy,
): ResolveChecksResult {
  const resolved: ResolvedCheck[] = [];
  const diagnostics: GenerateDiagnostic[] = [];

  const guardrailImpl = binding.guardrail_impl ?? {};

  for (const [guardrailId, impl] of Object.entries(guardrailImpl)) {
    const guardrail = dsl.guardrails[guardrailId];
    if (!guardrail) {
      diagnostics.push({
        path: `binding.${binding.software}.guardrail_impl.${guardrailId}`,
        message: `Binding "${binding.software}" implements guardrail "${guardrailId}" which is not defined in the DSL`,
        severity: "error",
      });
      continue;
    }

    const policyRule = policy.rules.find((r) => r.guardrail === guardrailId);
    if (!policyRule) {
      // No policy rule means this guardrail is not enforced — skip it
      diagnostics.push({
        path: `binding.${binding.software}.guardrail_impl.${guardrailId}`,
        message: `Guardrail "${guardrailId}" has no policy rule in the active policy — skipping`,
        severity: "info",
      });
      continue;
    }

    for (const check of impl.checks) {
      resolved.push({
        guardrail_id: guardrailId,
        guardrail,
        policy_rule: policyRule,
        check,
      });
    }
  }

  return { resolved, diagnostics };
}
