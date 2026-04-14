import { z } from "zod";

export const HandoffTypeSchema = z
  .object({
    version: z.number(),
    description: z.string().optional(),
    payload: z.record(z.string(), z.any()),
    example: z.record(z.string(), z.any()).optional(),
  })
  .passthrough();
export type HandoffType = z.infer<typeof HandoffTypeSchema>;
