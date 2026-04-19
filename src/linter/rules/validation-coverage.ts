import type { Dsl } from "../../schema/index.js";
import type { LintRule, LintDiagnostic } from "../types.js";

export const validationCoverageRule: LintRule = {
  id: "validation-coverage",
  description:
    "Every artifact should have at least one validation. Code/config artifacts should have mechanical validation.",

  run(dsl: Dsl): LintDiagnostic[] {
    const diagnostics: LintDiagnostic[] = [];

    const validationsByArtifact = new Map<string, Set<string>>();
    for (const val of Object.values(dsl.validations)) {
      if (!validationsByArtifact.has(val.target_artifact)) {
        validationsByArtifact.set(val.target_artifact, new Set());
      }
      validationsByArtifact.get(val.target_artifact)!.add(val.kind);
    }

    const strictArtifactTypes = ["code", "config", "schema"];

    for (const [artId, art] of Object.entries(dsl.artifacts)) {
      const kinds = validationsByArtifact.get(artId);

      if (!kinds || kinds.size === 0) {
        diagnostics.push({
          ruleId: "validation-coverage",
          severity: "warning",
          path: `artifacts.${artId}`,
          message: `Artifact "${artId}" has no validations defined`,
        });
        continue;
      }

      if (strictArtifactTypes.includes(art.type) && !kinds.has("mechanical") && !kinds.has("schema")) {
        diagnostics.push({
          ruleId: "validation-coverage",
          severity: "warning",
          path: `artifacts.${artId}`,
          message: `Artifact "${artId}" (type: ${art.type}) lacks mechanical or schema validation`,
        });
      }
    }

    for (const [artId, art] of Object.entries(dsl.artifacts)) {
      if (art.required_validations.length === 0) {
        diagnostics.push({
          ruleId: "validation-coverage",
          severity: "warning",
          path: `artifacts.${artId}`,
          message: `Artifact "${artId}" has empty required_validations`,
        });
      }
    }

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
    for (const [valId, val] of Object.entries(dsl.validations)) {
      if (val.blocking && !referencedValidations.has(valId)) {
        diagnostics.push({
          ruleId: "validation-coverage",
          severity: "warning",
          path: `validations.${valId}`,
          message: `Blocking validation "${valId}" is not referenced in any workflow step or task`,
        });
      }
    }

    return diagnostics;
  },
};
