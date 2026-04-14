import { z } from "zod";

export const ValidationSchema = z
  .object({
    target_artifact: z.string(),
    kind: z.enum(["schema", "mechanical", "semantic", "approval"]),
    executor_type: z.enum(["tool", "agent"]),
    executor: z.string(),
    blocking: z.boolean(),
    produces_evidence: z.string().optional(),
  })
  .passthrough();
export type Validation = z.infer<typeof ValidationSchema>;
