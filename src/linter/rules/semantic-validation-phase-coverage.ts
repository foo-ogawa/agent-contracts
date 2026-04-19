import type { Dsl } from "../../schema/index.js";
import type { LintRule, LintDiagnostic } from "../types.js";

const SEMANTIC_KINDS = new Set(["semantic", "fidelity"]);

export const semanticValidationPhaseCoverageRule: LintRule = {
  id: "semantic-validation-phase-coverage",
  description:
    "Semantic and fidelity validations should appear in early workflow phases, not only in late phases.",

  run(dsl: Dsl): LintDiagnostic[] {
    const diagnostics: LintDiagnostic[] = [];

    const semanticValIds = new Set<string>();
    for (const [valId, val] of Object.entries(dsl.validations)) {
      if (SEMANTIC_KINDS.has(val.kind)) {
        semanticValIds.add(valId);
      }
    }

    if (semanticValIds.size === 0) {
      return diagnostics;
    }

    const phaseOrder = dsl.system.default_workflow_order;
    if (phaseOrder.length < 2) {
      return diagnostics;
    }

    const phaseValidations = new Map<string, Set<string>>();
    for (const phase of phaseOrder) {
      phaseValidations.set(phase, new Set());
    }

    for (const [phase, wf] of Object.entries(dsl.workflow)) {
      if (!phaseValidations.has(phase)) continue;
      for (const step of wf.steps) {
        if (step.type === "validation" && semanticValIds.has(step.validation)) {
          phaseValidations.get(phase)!.add(step.validation);
        }
      }
    }

    for (const task of Object.values(dsl.tasks)) {
      const phase = task.workflow;
      if (!phaseValidations.has(phase)) continue;
      for (const valId of task.validations) {
        if (semanticValIds.has(valId)) {
          phaseValidations.get(phase)!.add(valId);
        }
      }
    }

    const earlyBoundary = Math.ceil(phaseOrder.length / 2);
    const earlyPhases = phaseOrder.slice(0, earlyBoundary);
    const latePhases = phaseOrder.slice(earlyBoundary);

    const earlyHasAny = earlyPhases.some(
      (p) => (phaseValidations.get(p)?.size ?? 0) > 0,
    );
    const lateWithSemantic = latePhases.filter(
      (p) => (phaseValidations.get(p)?.size ?? 0) > 0,
    );

    if (!earlyHasAny && lateWithSemantic.length > 0) {
      diagnostics.push({
        ruleId: "semantic-validation-phase-coverage",
        severity: "warning",
        path: "validations",
        message:
          `Semantic validations are only referenced in workflow phases [${lateWithSemantic.join(", ")}]. ` +
          `Consider adding semantic review to earlier phases [${earlyPhases.join(", ")}] to catch issues before implementation.`,
      });
    }

    return diagnostics;
  },
};
