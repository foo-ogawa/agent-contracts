import Ajv from "ajv";
import { z } from "zod";
import {
  DslSchema,
  type Dsl,
  SCOPE_NODE_TYPES,
  type ScopeNodeType,
} from "../schema/index.js";

export interface DiagnosticMessage {
  path: string;
  message: string;
  code: string;
  severity?: "error" | "warning";
}

export interface SchemaValidationResult {
  success: boolean;
  data?: Dsl;
  diagnostics: DiagnosticMessage[];
}

/* eslint-disable @typescript-eslint/no-explicit-any --
   Zod v4 internal types ($ZodType) diverge from the exported ZodType class.
   Runtime instanceof checks work correctly, but TypeScript sees a mismatch
   on .unwrap()/.removeDefault()/.element returns. Using `any` at the boundary
   keeps the recursive walker type-safe without pulling in Zod internals. */

function unwrap(schema: any): any {
  if (schema instanceof z.ZodOptional) return unwrap(schema.unwrap());
  if (schema instanceof z.ZodDefault) return unwrap(schema.removeDefault());
  if (schema instanceof z.ZodNullable) return unwrap(schema.unwrap());
  return schema;
}

function checkCustomPropsRecursive(
  data: unknown,
  schema: any,
  path: string,
): DiagnosticMessage[] {
  const inner = unwrap(schema);

  if (inner instanceof z.ZodObject) {
    if (typeof data !== "object" || data === null || Array.isArray(data)) return [];
    const obj = data as Record<string, unknown>;
    const shape = inner.shape as Record<string, any>;
    const knownKeys = new Set(Object.keys(shape));
    const diagnostics: DiagnosticMessage[] = [];
    for (const key of Object.keys(obj)) {
      if (knownKeys.has(key)) continue;
      if (key.startsWith("x-")) continue;
      diagnostics.push({
        path: path ? `${path}.${key}` : key,
        message: `Unknown property "${key}". Custom properties must use "x-" prefix.`,
        code: "unknown-property",
      });
    }
    for (const [field, fieldSchema] of Object.entries(shape)) {
      if (obj[field] === undefined) continue;
      diagnostics.push(...checkCustomPropsRecursive(obj[field], fieldSchema, path ? `${path}.${field}` : field));
    }
    return diagnostics;
  }

  if (inner instanceof z.ZodRecord) {
    if (typeof data !== "object" || data === null || Array.isArray(data)) return [];
    const valueSchema = inner._def.valueType;
    const diagnostics: DiagnosticMessage[] = [];
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      diagnostics.push(...checkCustomPropsRecursive(value, valueSchema, path ? `${path}.${key}` : key));
    }
    return diagnostics;
  }

  if (inner instanceof z.ZodArray) {
    if (!Array.isArray(data)) return [];
    const diagnostics: DiagnosticMessage[] = [];
    for (let i = 0; i < data.length; i++) {
      diagnostics.push(...checkCustomPropsRecursive(data[i], inner.element, `${path}[${i}]`));
    }
    return diagnostics;
  }

  if (inner instanceof z.ZodDiscriminatedUnion) {
    if (typeof data !== "object" || data === null) return [];
    const obj = data as Record<string, unknown>;
    const disc = (inner._def as any).discriminator as string;
    const discValue = obj[disc];
    const match = inner.options.find((opt: any) => {
      const shape = opt.shape as Record<string, any>;
      return shape[disc] instanceof z.ZodLiteral && shape[disc].value === discValue;
    });
    if (match) return checkCustomPropsRecursive(data, match, path);
    return [];
  }

  return [];
}

/* eslint-enable @typescript-eslint/no-explicit-any */

function checkXExtensionsKeys(
  data: Record<string, unknown>,
): DiagnosticMessage[] {
  const extensions = data["x-extensions"];
  if (typeof extensions !== "object" || extensions === null) return [];
  const diagnostics: DiagnosticMessage[] = [];
  for (const key of Object.keys(extensions as Record<string, unknown>)) {
    if (!key.startsWith("x-")) {
      diagnostics.push({
        path: `x-extensions.${key}`,
        message: `Extension key "${key}" must start with "x-" prefix.`,
        code: "x-extension-key-prefix",
      });
    }
  }
  return diagnostics;
}

function checkDecisionStepRoutingKey(
  data: Record<string, unknown>,
): DiagnosticMessage[] {
  const workflow = data["workflow"];
  if (typeof workflow !== "object" || workflow === null) return [];
  const diagnostics: DiagnosticMessage[] = [];
  for (const [wfKey, wf] of Object.entries(
    workflow as Record<string, unknown>,
  )) {
    if (typeof wf !== "object" || wf === null) continue;
    const steps = (wf as Record<string, unknown>)["steps"];
    if (!Array.isArray(steps)) continue;
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (typeof step !== "object" || step === null) continue;
      const s = step as Record<string, unknown>;
      if (s["type"] !== "decision") continue;
      if (s["routing_key"] === undefined && s["on"] === undefined) {
        diagnostics.push({
          path: `workflow.${wfKey}.steps[${i}]`,
          message:
            'Decision step requires "routing_key" (or deprecated "on"). Prefer "routing_key".',
          code: "decision-missing-routing-key",
        });
      }
    }
  }
  return diagnostics;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

type ExtensionDeclMap = Record<
  string,
  {
    scope?: ScopeNodeType[];
    schema?: Record<string, unknown>;
    required?: boolean;
  }
>;

function* enumerateEntitiesByType(
  data: Record<string, unknown>,
  nodeType: ScopeNodeType,
): Generator<{ path: string; obj: Record<string, unknown> }> {
  switch (nodeType) {
    case "Root":
      yield { path: "", obj: data };
      return;
    case "System": {
      const sys = data["system"];
      if (isRecord(sys)) yield { path: "system", obj: sys };
      return;
    }
    case "Agent": {
      const agents = data["agents"];
      if (!isRecord(agents)) return;
      for (const [id, a] of Object.entries(agents)) {
        if (isRecord(a)) yield { path: `agents.${id}`, obj: a };
      }
      return;
    }
    case "Rule": {
      const agents = data["agents"];
      if (!isRecord(agents)) return;
      for (const [aid, a] of Object.entries(agents)) {
        if (!isRecord(a)) continue;
        const rules = a["rules"];
        if (!Array.isArray(rules)) continue;
        for (let i = 0; i < rules.length; i++) {
          const r = rules[i];
          if (isRecord(r)) yield { path: `agents.${aid}.rules[${i}]`, obj: r };
        }
      }
      return;
    }
    case "EscalationCriterion": {
      const agents = data["agents"];
      if (!isRecord(agents)) return;
      for (const [aid, a] of Object.entries(agents)) {
        if (!isRecord(a)) continue;
        const esc = a["escalation_criteria"];
        if (!Array.isArray(esc)) continue;
        for (let i = 0; i < esc.length; i++) {
          const e = esc[i];
          if (isRecord(e)) {
            yield {
              path: `agents.${aid}.escalation_criteria[${i}]`,
              obj: e,
            };
          }
        }
      }
      return;
    }
    case "Prerequisite": {
      const agents = data["agents"];
      if (!isRecord(agents)) return;
      for (const [aid, a] of Object.entries(agents)) {
        if (!isRecord(a)) continue;
        const pre = a["prerequisites"];
        if (!Array.isArray(pre)) continue;
        for (let i = 0; i < pre.length; i++) {
          const p = pre[i];
          if (isRecord(p)) {
            yield { path: `agents.${aid}.prerequisites[${i}]`, obj: p };
          }
        }
      }
      return;
    }
    case "Task": {
      const tasks = data["tasks"];
      if (!isRecord(tasks)) return;
      for (const [id, t] of Object.entries(tasks)) {
        if (isRecord(t)) yield { path: `tasks.${id}`, obj: t };
      }
      return;
    }
    case "ExecutionStep": {
      const tasks = data["tasks"];
      if (!isRecord(tasks)) return;
      for (const [tid, t] of Object.entries(tasks)) {
        if (!isRecord(t)) continue;
        const steps = t["execution_steps"];
        if (!Array.isArray(steps)) continue;
        for (let i = 0; i < steps.length; i++) {
          const s = steps[i];
          if (isRecord(s)) {
            yield {
              path: `tasks.${tid}.execution_steps[${i}]`,
              obj: s,
            };
          }
        }
      }
      return;
    }
    case "Artifact": {
      const arts = data["artifacts"];
      if (!isRecord(arts)) return;
      for (const [id, a] of Object.entries(arts)) {
        if (isRecord(a)) yield { path: `artifacts.${id}`, obj: a };
      }
      return;
    }
    case "Tool": {
      const tools = data["tools"];
      if (!isRecord(tools)) return;
      for (const [id, t] of Object.entries(tools)) {
        if (isRecord(t)) yield { path: `tools.${id}`, obj: t };
      }
      return;
    }
    case "ToolCommand": {
      const tools = data["tools"];
      if (!isRecord(tools)) return;
      for (const [tid, t] of Object.entries(tools)) {
        if (!isRecord(t)) continue;
        const cmds = t["commands"];
        if (!Array.isArray(cmds)) continue;
        for (let i = 0; i < cmds.length; i++) {
          const c = cmds[i];
          if (isRecord(c)) {
            yield { path: `tools.${tid}.commands[${i}]`, obj: c };
          }
        }
      }
      return;
    }
    case "Validation": {
      const vals = data["validations"];
      if (!isRecord(vals)) return;
      for (const [id, v] of Object.entries(vals)) {
        if (isRecord(v)) yield { path: `validations.${id}`, obj: v };
      }
      return;
    }
    case "HandoffType": {
      const ht = data["handoff_types"];
      if (!isRecord(ht)) return;
      for (const [id, h] of Object.entries(ht)) {
        if (isRecord(h)) yield { path: `handoff_types.${id}`, obj: h };
      }
      return;
    }
    case "Workflow": {
      const wf = data["workflow"];
      if (!isRecord(wf)) return;
      for (const [id, w] of Object.entries(wf)) {
        if (isRecord(w)) yield { path: `workflow.${id}`, obj: w };
      }
      return;
    }
    case "WorkflowStep": {
      const wf = data["workflow"];
      if (!isRecord(wf)) return;
      for (const [wid, w] of Object.entries(wf)) {
        if (!isRecord(w)) continue;
        const steps = w["steps"];
        if (!Array.isArray(steps)) continue;
        for (let i = 0; i < steps.length; i++) {
          const s = steps[i];
          if (isRecord(s)) {
            yield { path: `workflow.${wid}.steps[${i}]`, obj: s };
          }
        }
      }
      return;
    }
    case "Policy": {
      const pol = data["policies"];
      if (!isRecord(pol)) return;
      for (const [id, p] of Object.entries(pol)) {
        if (isRecord(p)) yield { path: `policies.${id}`, obj: p };
      }
      return;
    }
    case "Guardrail": {
      const gr = data["guardrails"];
      if (!isRecord(gr)) return;
      for (const [id, g] of Object.entries(gr)) {
        if (isRecord(g)) yield { path: `guardrails.${id}`, obj: g };
      }
      return;
    }
    case "GuardrailPolicy": {
      const gp = data["guardrail_policies"];
      if (!isRecord(gp)) return;
      for (const [id, p] of Object.entries(gp)) {
        if (isRecord(p)) yield { path: `guardrail_policies.${id}`, obj: p };
      }
      return;
    }
    default:
      return;
  }
}

function validateDeclaredExtension(
  parentPath: string,
  nodeType: ScopeNodeType,
  key: string,
  val: unknown,
  declMap: ExtensionDeclMap,
  diagnostics: DiagnosticMessage[],
  ajvInstance: Ajv,
): void {
  const path = parentPath ? `${parentPath}.${key}` : key;
  const decl = declMap[key];
  if (decl === undefined) {
    diagnostics.push({
      path,
      message: `Extension "${key}" is not declared in x-extensions.`,
      code: "undeclared-extension",
      severity: "warning",
    });
    return;
  }
  const scope = decl.scope;
  if (scope && scope.length > 0 && !scope.includes(nodeType)) {
    diagnostics.push({
      path,
      message: `Extension "${key}" is not allowed on ${nodeType} (declared scope: ${scope.join(", ")}).`,
      code: "extension-scope-mismatch",
    });
    return;
  }
  if (
    decl.schema &&
    typeof decl.schema === "object" &&
    decl.schema !== null &&
    Object.keys(decl.schema).length > 0
  ) {
    try {
      const validate = ajvInstance.compile(decl.schema);
      if (!validate(val)) {
        diagnostics.push({
          path,
          message: `Extension "${key}" value does not match declared schema: ${ajvInstance.errorsText(validate.errors)}`,
          code: "extension-schema-violation",
        });
      }
    } catch (e) {
      diagnostics.push({
        path,
        message: `Extension "${key}" has invalid JSON Schema in declaration: ${e instanceof Error ? e.message : String(e)}`,
        code: "extension-schema-violation",
      });
    }
  }
}

function walkExtensionNodes(
  value: unknown,
  path: string,
  nodeType: ScopeNodeType,
  declMap: ExtensionDeclMap,
  diagnostics: DiagnosticMessage[],
  ajvInstance: Ajv,
): void {
  if (!isRecord(value)) return;
  const obj = value;

  for (const key of Object.keys(obj)) {
    if (key === "x-extensions") continue;
    if (key.startsWith("x-")) {
      validateDeclaredExtension(
        path,
        nodeType,
        key,
        obj[key],
        declMap,
        diagnostics,
        ajvInstance,
      );
    }
  }

  switch (nodeType) {
    case "Root": {
      const sys = obj["system"];
      if (isRecord(sys)) {
        walkExtensionNodes(
          sys,
          "system",
          "System",
          declMap,
          diagnostics,
          ajvInstance,
        );
      }
      const agents = obj["agents"];
      if (isRecord(agents)) {
        for (const [id, a] of Object.entries(agents)) {
          if (isRecord(a)) {
            walkExtensionNodes(
              a,
              `agents.${id}`,
              "Agent",
              declMap,
              diagnostics,
              ajvInstance,
            );
          }
        }
      }
      const tasks = obj["tasks"];
      if (isRecord(tasks)) {
        for (const [id, t] of Object.entries(tasks)) {
          if (isRecord(t)) {
            walkExtensionNodes(
              t,
              `tasks.${id}`,
              "Task",
              declMap,
              diagnostics,
              ajvInstance,
            );
          }
        }
      }
      const artifacts = obj["artifacts"];
      if (isRecord(artifacts)) {
        for (const [id, a] of Object.entries(artifacts)) {
          if (isRecord(a)) {
            walkExtensionNodes(
              a,
              `artifacts.${id}`,
              "Artifact",
              declMap,
              diagnostics,
              ajvInstance,
            );
          }
        }
      }
      const tools = obj["tools"];
      if (isRecord(tools)) {
        for (const [id, t] of Object.entries(tools)) {
          if (isRecord(t)) {
            walkExtensionNodes(
              t,
              `tools.${id}`,
              "Tool",
              declMap,
              diagnostics,
              ajvInstance,
            );
          }
        }
      }
      const validations = obj["validations"];
      if (isRecord(validations)) {
        for (const [id, v] of Object.entries(validations)) {
          if (isRecord(v)) {
            walkExtensionNodes(
              v,
              `validations.${id}`,
              "Validation",
              declMap,
              diagnostics,
              ajvInstance,
            );
          }
        }
      }
      const handoffTypes = obj["handoff_types"];
      if (isRecord(handoffTypes)) {
        for (const [id, h] of Object.entries(handoffTypes)) {
          if (isRecord(h)) {
            walkExtensionNodes(
              h,
              `handoff_types.${id}`,
              "HandoffType",
              declMap,
              diagnostics,
              ajvInstance,
            );
          }
        }
      }
      const workflow = obj["workflow"];
      if (isRecord(workflow)) {
        for (const [id, w] of Object.entries(workflow)) {
          if (isRecord(w)) {
            walkExtensionNodes(
              w,
              `workflow.${id}`,
              "Workflow",
              declMap,
              diagnostics,
              ajvInstance,
            );
          }
        }
      }
      const policies = obj["policies"];
      if (isRecord(policies)) {
        for (const [id, p] of Object.entries(policies)) {
          if (isRecord(p)) {
            walkExtensionNodes(
              p,
              `policies.${id}`,
              "Policy",
              declMap,
              diagnostics,
              ajvInstance,
            );
          }
        }
      }
      const guardrails = obj["guardrails"];
      if (isRecord(guardrails)) {
        for (const [id, g] of Object.entries(guardrails)) {
          if (isRecord(g)) {
            walkExtensionNodes(
              g,
              `guardrails.${id}`,
              "Guardrail",
              declMap,
              diagnostics,
              ajvInstance,
            );
          }
        }
      }
      const guardrailPolicies = obj["guardrail_policies"];
      if (isRecord(guardrailPolicies)) {
        for (const [id, p] of Object.entries(guardrailPolicies)) {
          if (isRecord(p)) {
            walkExtensionNodes(
              p,
              `guardrail_policies.${id}`,
              "GuardrailPolicy",
              declMap,
              diagnostics,
              ajvInstance,
            );
          }
        }
      }
      break;
    }
    case "Agent": {
      const rules = obj["rules"];
      if (Array.isArray(rules)) {
        for (let i = 0; i < rules.length; i++) {
          const r = rules[i];
          if (isRecord(r)) {
            walkExtensionNodes(
              r,
              `${path}.rules[${i}]`,
              "Rule",
              declMap,
              diagnostics,
              ajvInstance,
            );
          }
        }
      }
      const esc = obj["escalation_criteria"];
      if (Array.isArray(esc)) {
        for (let i = 0; i < esc.length; i++) {
          const e = esc[i];
          if (isRecord(e)) {
            walkExtensionNodes(
              e,
              `${path}.escalation_criteria[${i}]`,
              "EscalationCriterion",
              declMap,
              diagnostics,
              ajvInstance,
            );
          }
        }
      }
      const pre = obj["prerequisites"];
      if (Array.isArray(pre)) {
        for (let i = 0; i < pre.length; i++) {
          const p = pre[i];
          if (isRecord(p)) {
            walkExtensionNodes(
              p,
              `${path}.prerequisites[${i}]`,
              "Prerequisite",
              declMap,
              diagnostics,
              ajvInstance,
            );
          }
        }
      }
      break;
    }
    case "Task": {
      const steps = obj["execution_steps"];
      if (Array.isArray(steps)) {
        for (let i = 0; i < steps.length; i++) {
          const s = steps[i];
          if (isRecord(s)) {
            walkExtensionNodes(
              s,
              `${path}.execution_steps[${i}]`,
              "ExecutionStep",
              declMap,
              diagnostics,
              ajvInstance,
            );
          }
        }
      }
      break;
    }
    case "Tool": {
      const cmds = obj["commands"];
      if (Array.isArray(cmds)) {
        for (let i = 0; i < cmds.length; i++) {
          const c = cmds[i];
          if (isRecord(c)) {
            walkExtensionNodes(
              c,
              `${path}.commands[${i}]`,
              "ToolCommand",
              declMap,
              diagnostics,
              ajvInstance,
            );
          }
        }
      }
      break;
    }
    case "Workflow": {
      const steps = obj["steps"];
      if (Array.isArray(steps)) {
        for (let i = 0; i < steps.length; i++) {
          const s = steps[i];
          if (isRecord(s)) {
            walkExtensionNodes(
              s,
              `${path}.steps[${i}]`,
              "WorkflowStep",
              declMap,
              diagnostics,
              ajvInstance,
            );
          }
        }
      }
      break;
    }
    default:
      break;
  }
}

function checkExtensionValidation(
  data: Record<string, unknown>,
): DiagnosticMessage[] {
  const raw = data["x-extensions"];
  if (!isRecord(raw) || Object.keys(raw).length === 0) {
    return [];
  }

  const declMap = raw as ExtensionDeclMap;
  const diagnostics: DiagnosticMessage[] = [];
  const ajvInstance = new Ajv({ allErrors: true, strict: false });

  walkExtensionNodes(data, "", "Root", declMap, diagnostics, ajvInstance);

  for (const [extKey, decl] of Object.entries(declMap)) {
    if (!decl.required) continue;
    const applicableTypes: ScopeNodeType[] =
      decl.scope && decl.scope.length > 0
        ? decl.scope
        : [...SCOPE_NODE_TYPES];

    for (const t of applicableTypes) {
      for (const { path, obj } of enumerateEntitiesByType(data, t)) {
        if (!(extKey in obj)) {
          diagnostics.push({
            path,
            message: `Required extension "${extKey}" is missing on ${t}.`,
            code: "extension-required-missing",
          });
        }
      }
    }
  }

  return diagnostics;
}

function hasBlockingDiagnostic(diagnostics: DiagnosticMessage[]): boolean {
  return diagnostics.some((d) => d.severity !== "warning");
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

  const diagnostics: DiagnosticMessage[] = [
    ...checkCustomPropsRecursive(data, DslSchema, ""),
    ...checkDecisionStepRoutingKey(data),
    ...checkXExtensionsKeys(data),
    ...checkExtensionValidation(data),
  ];

  return {
    success: !hasBlockingDiagnostic(diagnostics),
    data: result.data,
    diagnostics,
  };
}
