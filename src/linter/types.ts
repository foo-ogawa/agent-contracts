import type { Dsl } from "../schema/index.js";

export type Severity = "error" | "warning" | "info";

export interface LintDiagnostic {
  ruleId: string;
  severity: Severity;
  path: string;
  message: string;
}

export interface LintRule {
  id: string;
  description: string;
  run(dsl: Dsl): LintDiagnostic[];
}
