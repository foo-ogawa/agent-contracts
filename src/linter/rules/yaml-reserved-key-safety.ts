import type { Dsl } from "../../schema/index.js";
import type { LintRule, LintDiagnostic } from "../types.js";

const YAML_11_RESERVED_KEYS = new Set([
  "on",
  "off",
  "yes",
  "no",
  "true",
  "false",
  "y",
  "n",
]);

export const yamlReservedKeySafetyRule: LintRule = {
  id: "yaml-reserved-key-safety",
  description:
    "Warns when YAML 1.1 reserved words are used as field values in positions where they may be misinterpreted by non-1.2 parsers",

  run(dsl: Dsl): LintDiagnostic[] {
    const diagnostics: LintDiagnostic[] = [];

    for (const [wfKey, wf] of Object.entries(dsl.workflow)) {
      for (let i = 0; i < wf.steps.length; i++) {
        const step = wf.steps[i];
        if (step.type !== "decision") continue;

        if (step.on !== undefined && step.routing_key === undefined) {
          diagnostics.push({
            ruleId: "yaml-reserved-key-safety",
            severity: "warning",
            path: `workflow.${wfKey}.steps[${i}].on`,
            message:
              'Field name "on" is a YAML 1.1 reserved word and may be interpreted as boolean true by some parsers. Use "routing_key" instead.',
          });
        }

        const branchKeys = Object.keys(step.branches);
        for (const key of branchKeys) {
          if (YAML_11_RESERVED_KEYS.has(key.toLowerCase())) {
            diagnostics.push({
              ruleId: "yaml-reserved-key-safety",
              severity: "warning",
              path: `workflow.${wfKey}.steps[${i}].branches.${key}`,
              message: `Branch key "${key}" is a YAML 1.1 reserved word and may be interpreted as a boolean by some parsers. Consider quoting or renaming.`,
            });
          }
        }
      }
    }

    return diagnostics;
  },
};
