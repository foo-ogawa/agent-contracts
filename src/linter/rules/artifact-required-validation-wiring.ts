import type { Dsl } from "../../schema/index.js";
import type { LintRule, LintDiagnostic } from "../types.js";

export const artifactRequiredValidationWiringRule: LintRule = {
  id: "artifact-required-validation-wiring",
  description:
    "Every validation listed in artifact.required_validations must exist, target the artifact, and be referenced in a workflow step or task.",

  run(dsl: Dsl): LintDiagnostic[] {
    const diagnostics: LintDiagnostic[] = [];

    const referencedValidations = new Set<string>();
    for (const wf of Object.values(dsl.workflow)) {
      for (const step of wf.steps) {
        if (step.type === "validation") {
          referencedValidations.add(step.validation);
        }
      }
    }
    for (const task of Object.values(dsl.tasks)) {
      for (const valId of task.validations) {
        referencedValidations.add(valId);
      }
    }

    for (const [artId, art] of Object.entries(dsl.artifacts)) {
      for (const reqValId of art.required_validations) {
        const val = dsl.validations[reqValId];

        if (!val) {
          diagnostics.push({
            ruleId: "artifact-required-validation-wiring",
            severity: "error",
            path: `artifacts.${artId}`,
            message: `required_validation "${reqValId}" does not exist in validations`,
          });
          continue;
        }

        if (val.target_artifact !== artId) {
          diagnostics.push({
            ruleId: "artifact-required-validation-wiring",
            severity: "error",
            path: `artifacts.${artId}`,
            message: `required_validation "${reqValId}" has target_artifact "${val.target_artifact}" instead of "${artId}"`,
          });
        }

        if (!referencedValidations.has(reqValId)) {
          diagnostics.push({
            ruleId: "artifact-required-validation-wiring",
            severity: "warning",
            path: `artifacts.${artId}`,
            message: `required_validation "${reqValId}" is defined but not referenced in any workflow step or task`,
          });
        }
      }
    }

    return diagnostics;
  },
};
