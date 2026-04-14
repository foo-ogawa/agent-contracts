import type { Dsl } from "../../schema/index.js";
import type { LintRule, LintDiagnostic } from "../types.js";

export const releaseAuditRule: LintRule = {
  id: "release-audit",
  description:
    "Workflow graph completeness: release/audit phases should have proper handoff structures",

  run(dsl: Dsl): LintDiagnostic[] {
    const diagnostics: LintDiagnostic[] = [];

    const phases = dsl.system.default_phase_order;
    const hasAuditPhase = phases.some(
      (p) => p === "audit" || p === "release" || p === "review",
    );

    if (!hasAuditPhase) {
      return diagnostics;
    }

    const handoffKinds = new Set(Object.keys(dsl.handoff_types));
    const hasReleaseReadiness = handoffKinds.has("release-readiness");
    const hasReleaseResult = handoffKinds.has("release-result");

    if (!hasReleaseReadiness) {
      diagnostics.push({
        ruleId: "release-audit",
        severity: "warning",
        path: "handoff_types",
        message: 'Missing "release-readiness" handoff type for audit/release workflow',
      });
    }

    if (!hasReleaseResult) {
      diagnostics.push({
        ruleId: "release-audit",
        severity: "warning",
        path: "handoff_types",
        message: 'Missing "release-result" handoff type for audit/release workflow',
      });
    }

    if (phases.some((p) => p === "audit")) {
      const hasAuditReport = handoffKinds.has("audit-report");
      const hasAuditReconciliation = handoffKinds.has("audit-reconciliation");

      if (!hasAuditReport) {
        diagnostics.push({
          ruleId: "release-audit",
          severity: "warning",
          path: "handoff_types",
          message: 'Missing "audit-report" handoff type for audit workflow',
        });
      }

      if (!hasAuditReconciliation) {
        diagnostics.push({
          ruleId: "release-audit",
          severity: "warning",
          path: "handoff_types",
          message: 'Missing "audit-reconciliation" handoff type for audit workflow',
        });
      }
    }

    const workflowPhases = new Set(Object.keys(dsl.workflow));
    for (const phase of phases) {
      if ((phase === "audit" || phase === "release") && !workflowPhases.has(phase)) {
        diagnostics.push({
          ruleId: "release-audit",
          severity: "warning",
          path: "workflow",
          message: `Phase "${phase}" is in default_phase_order but has no workflow definition`,
        });
      }
    }

    for (const [phase, wf] of Object.entries(dsl.workflow)) {
      if (phase !== "audit" && phase !== "release") continue;

      const hasDecision = wf.steps.some((s) => s.type === "decision");
      if (!hasDecision) {
        diagnostics.push({
          ruleId: "release-audit",
          severity: "info",
          path: `workflow.${phase}`,
          message: `Audit/release workflow phase "${phase}" has no decision step for remediation routing`,
        });
      }
    }

    return diagnostics;
  },
};
