import { z } from "zod";
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

  const customPropDiagnostics = checkCustomPropsRecursive(data, DslSchema, "");
  if (customPropDiagnostics.length > 0) {
    return { success: false, diagnostics: customPropDiagnostics };
  }

  const decisionDiagnostics = checkDecisionStepRoutingKey(data);
  if (decisionDiagnostics.length > 0) {
    return { success: false, diagnostics: decisionDiagnostics };
  }

  const xExtDiagnostics = checkXExtensionsKeys(data);
  if (xExtDiagnostics.length > 0) {
    return { success: false, diagnostics: xExtDiagnostics };
  }

  return { success: true, data: result.data, diagnostics: [] };
}
