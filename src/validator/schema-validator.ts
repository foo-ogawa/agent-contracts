import { DslSchema, type Dsl } from "../schema/index.js";

export interface DiagnosticMessage {
  path: string;
  message: string;
  code: string;
}

export interface SchemaValidationResult {
  success: boolean;
  data?: Dsl;
  diagnostics: DiagnosticMessage[];
}

function hasNonExtensionCustomProps(
  obj: Record<string, unknown>,
  knownKeys: Set<string>,
  path: string,
): DiagnosticMessage[] {
  const diagnostics: DiagnosticMessage[] = [];
  for (const key of Object.keys(obj)) {
    if (knownKeys.has(key)) continue;
    if (key.startsWith("x-")) continue;
    diagnostics.push({
      path: `${path}.${key}`,
      message: `Unknown property "${key}". Custom properties must use "x-" prefix.`,
      code: "unknown-property",
    });
  }
  return diagnostics;
}

const SYSTEM_KEYS = new Set(["id", "name", "default_phase_order"]);
const AGENT_KEYS = new Set([
  "role_name", "purpose", "can_read_artifacts", "can_write_artifacts",
  "can_execute_tools", "can_perform_validations", "can_invoke_agents",
  "can_return_handoffs", "dispatch_only", "mode", "responsibilities",
  "constraints", "rules", "anti_patterns", "escalation_criteria", "prerequisites",
]);
const TASK_KEYS = new Set([
  "description", "target_agent", "allowed_from_agents", "phase",
  "input_artifacts", "invocation_handoff", "result_handoff", "default_priority",
  "responsibilities", "constraints", "execution_steps", "completion_criteria",
  "rules", "anti_patterns", "escalation_criteria",
]);
const ARTIFACT_KEYS = new Set([
  "type", "description", "owner", "producers", "editors", "consumers",
  "states", "required_validations", "visibility",
]);
const TOOL_KEYS = new Set([
  "kind", "description", "input_artifacts", "output_artifacts",
  "invokable_by", "side_effects",
]);
const VALIDATION_KEYS = new Set([
  "target_artifact", "kind", "executor_type", "executor", "blocking",
  "produces_evidence",
]);
const HANDOFF_TYPE_KEYS = new Set(["version", "description", "payload"]);
const WORKFLOW_KEYS = new Set(["entry_conditions", "steps"]);
const POLICY_KEYS = new Set(["when", "requires_validations", "requires"]);

function checkCustomProps(data: Record<string, unknown>): DiagnosticMessage[] {
  const diagnostics: DiagnosticMessage[] = [];

  if (data["system"] && typeof data["system"] === "object") {
    diagnostics.push(
      ...hasNonExtensionCustomProps(data["system"] as Record<string, unknown>, SYSTEM_KEYS, "system"),
    );
  }

  const sections: Array<{ key: string; knownKeys: Set<string> }> = [
    { key: "agents", knownKeys: AGENT_KEYS },
    { key: "tasks", knownKeys: TASK_KEYS },
    { key: "artifacts", knownKeys: ARTIFACT_KEYS },
    { key: "tools", knownKeys: TOOL_KEYS },
    { key: "validations", knownKeys: VALIDATION_KEYS },
    { key: "handoff_types", knownKeys: HANDOFF_TYPE_KEYS },
    { key: "workflow", knownKeys: WORKFLOW_KEYS },
    { key: "policies", knownKeys: POLICY_KEYS },
  ];

  for (const { key, knownKeys } of sections) {
    const map = data[key];
    if (typeof map !== "object" || map === null || Array.isArray(map)) continue;
    for (const [entryKey, item] of Object.entries(map as Record<string, unknown>)) {
      if (typeof item !== "object" || item === null) continue;
      diagnostics.push(
        ...hasNonExtensionCustomProps(item as Record<string, unknown>, knownKeys, `${key}.${entryKey}`),
      );
    }
  }

  return diagnostics;
}

export function validateSchema(
  data: Record<string, unknown>,
): SchemaValidationResult {
  const result = DslSchema.safeParse(data);

  if (!result.success) {
    const diagnostics: DiagnosticMessage[] = result.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
      code: "schema-validation",
    }));
    return { success: false, diagnostics };
  }

  const customPropDiagnostics = checkCustomProps(data);
  if (customPropDiagnostics.length > 0) {
    return { success: false, diagnostics: customPropDiagnostics };
  }

  return { success: true, data: result.data, diagnostics: [] };
}
