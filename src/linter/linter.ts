import type { Dsl } from "../schema/index.js";
import type { LintRule, LintDiagnostic } from "./types.js";
import { validationCoverageRule } from "./rules/validation-coverage.js";
import { toolExecutionRule } from "./rules/tool-execution.js";
import { taskAgentBindingRule } from "./rules/task-agent-binding.js";
import { mergeIntegrityRule } from "./rules/merge-integrity.js";
import { artifactOwnershipRule } from "./rules/artifact-ownership.js";
import { toolCommandsRule } from "./rules/tool-commands.js";
import { guardrailPolicyCoverageRule } from "./rules/guardrail-policy-coverage.js";
import { yamlReservedKeySafetyRule } from "./rules/yaml-reserved-key-safety.js";

const builtinRules: LintRule[] = [
  validationCoverageRule,
  toolExecutionRule,
  taskAgentBindingRule,
  mergeIntegrityRule,
  artifactOwnershipRule,
  toolCommandsRule,
  guardrailPolicyCoverageRule,
  yamlReservedKeySafetyRule,
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
