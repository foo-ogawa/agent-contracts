import type { Dsl } from "../schema/index.js";
import type { LintRule, LintDiagnostic } from "./types.js";
import { validationCoverageRule } from "./rules/validation-coverage.js";
import { toolExecutionRule } from "./rules/tool-execution.js";
import { taskAgentBindingRule } from "./rules/task-agent-binding.js";
import { mergeIntegrityRule } from "./rules/merge-integrity.js";

const builtinRules: LintRule[] = [
  validationCoverageRule,
  toolExecutionRule,
  taskAgentBindingRule,
  mergeIntegrityRule,
];

export function lint(
  dsl: Dsl,
  rules: LintRule[] = builtinRules,
): LintDiagnostic[] {
  const diagnostics: LintDiagnostic[] = [];
  for (const rule of rules) {
    diagnostics.push(...rule.run(dsl));
  }
  return diagnostics;
}

export { builtinRules };
