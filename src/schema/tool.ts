import { z } from "zod";

export const ToolSchema = z
  .object({
    kind: z.string(),
    description: z.string().optional(),
    input_artifacts: z.array(z.string()).default([]),
    output_artifacts: z.array(z.string()).default([]),
    invokable_by: z.array(z.string()),
    side_effects: z.array(z.string()).default([]),
  })
  .passthrough();
export type Tool = z.infer<typeof ToolSchema>;
