import type { Dsl } from "../../schema/index.js";
import type { LintRule, LintDiagnostic } from "../types.js";

export const taskOutputValidationCompletenessRule: LintRule = {
  id: "task-output-validation-completeness",
  description:
    "Tasks producing artifacts should cover those artifacts' required_validations in their validations list.",

  run(dsl: Dsl): LintDiagnostic[] {
    const diagnostics: LintDiagnostic[] = [];

    for (const [taskId, task] of Object.entries(dsl.tasks)) {
      const producedArtifacts = new Set<string>();

      if (task.execution_steps) {
        for (const step of task.execution_steps) {
          if (step.produces_artifact) {
            producedArtifacts.add(step.produces_artifact);
          }
        }
      }

      const agent = dsl.agents[task.target_agent];
      if (agent) {
        for (const artId of agent.can_write_artifacts) {
          producedArtifacts.add(artId);
        }
      }

      const taskValidations = new Set(task.validations);

      for (const artId of producedArtifacts) {
        const art = dsl.artifacts[artId];
        if (!art || art.required_validations.length === 0) continue;

        const missing = art.required_validations.filter(
          (v) => !taskValidations.has(v),
        );
        if (missing.length > 0) {
          diagnostics.push({
            ruleId: "task-output-validation-completeness",
            severity: "warning",
            path: `tasks.${taskId}`,
            message: `Task produces artifact "${artId}" which requires validations [${missing.join(", ")}] but task.validations does not include them`,
          });
        }
      }
    }

    return diagnostics;
  },
};
