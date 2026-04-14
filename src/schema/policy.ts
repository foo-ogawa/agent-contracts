import { z } from "zod";

export const PolicyWhenSchema = z
  .object({
    artifact_type: z.string().optional(),
    workflow: z.string().optional(),
  })
  .passthrough();
export type PolicyWhen = z.infer<typeof PolicyWhenSchema>;

export const PolicySchema = z
  .object({
    when: PolicyWhenSchema,
    requires_validations: z.array(z.string()).optional(),
    requires: z.array(z.string()).optional(),
  })
  .passthrough();
export type Policy = z.infer<typeof PolicySchema>;
