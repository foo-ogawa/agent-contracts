import { DslSchema } from "../schema/index.js";

/**
 * Parse the resolved DSL through Zod to fill all schema-defined default
 * values, then return the fully-expanded plain object.
 *
 * If parsing fails (e.g. the DSL has validation errors), the original
 * data is returned unchanged so that `resolve` remains non-destructive.
 */
export function expandDefaults(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const result = DslSchema.safeParse(data);
  if (!result.success) return data;
  return JSON.parse(JSON.stringify(result.data));
}
