import { z } from "zod";

/**
 * Zod schema for a handoff type definition.
 *
 * `schema` holds a JSON Schema object describing the full message structure
 * for this handoff type. It may use `allOf` to compose shared fragments
 * (e.g., from `components.schemas`) with type-specific properties.
 */
export const HandoffTypeSchema = z
  .object({
    version: z.number(),
    description: z.string().optional(),
    schema: z.record(z.string(), z.any()),
    example: z.record(z.string(), z.any()).optional(),
  })
  .passthrough();
export type HandoffType = z.infer<typeof HandoffTypeSchema>;
