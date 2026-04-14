import type { Dsl } from "../../schema/index.js";
import type { LintRule, LintDiagnostic } from "../types.js";

export const mergeIntegrityRule: LintRule = {
  id: "merge-integrity",
  description:
    "Post-merge integrity: check that resolved DSL phase order has no duplicates",

  run(dsl: Dsl): LintDiagnostic[] {
    const diagnostics: LintDiagnostic[] = [];

    const phases = dsl.system.default_phase_order;
    const phaseSeen = new Set<string>();
    for (let i = 0; i < phases.length; i++) {
      if (phaseSeen.has(phases[i])) {
        diagnostics.push({
          ruleId: "merge-integrity",
          severity: "error",
          path: `system.default_phase_order[${i}]`,
          message: `Duplicate phase "${phases[i]}" in default_phase_order`,
        });
      }
      phaseSeen.add(phases[i]);
    }

    return diagnostics;
  },
};
