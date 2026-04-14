import type { Dsl } from "../../schema/index.js";
import type { LintRule, LintDiagnostic } from "../types.js";

export const mergeIntegrityRule: LintRule = {
  id: "merge-integrity",
  description:
    "Post-merge integrity: check that resolved DSL workflow order has no duplicates",

  run(dsl: Dsl): LintDiagnostic[] {
    const diagnostics: LintDiagnostic[] = [];

    const workflows = dsl.system.default_workflow_order;
    const seen = new Set<string>();
    for (let i = 0; i < workflows.length; i++) {
      if (seen.has(workflows[i])) {
        diagnostics.push({
          ruleId: "merge-integrity",
          severity: "error",
          path: `system.default_workflow_order[${i}]`,
          message: `Duplicate workflow "${workflows[i]}" in default_workflow_order`,
        });
      }
      seen.add(workflows[i]);
    }

    return diagnostics;
  },
};
