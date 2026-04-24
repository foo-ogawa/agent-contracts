import { z } from "zod";

export const TeamInterfaceAcceptWorkflowSchema = z
  .object({
    internal_workflow: z.string().optional(),
    input_handoff: z.string(),
    output_handoff: z.string(),
    description: z.string().optional(),
  })
  .passthrough();
export type TeamInterfaceAcceptWorkflow = z.infer<
  typeof TeamInterfaceAcceptWorkflowSchema
>;

export const TeamInterfaceSchema = z
  .object({
    version: z.number(),
    description: z.string().optional(),
    accepts: z
      .object({
        workflows: z.record(z.string(), TeamInterfaceAcceptWorkflowSchema),
      })
      .passthrough()
      .optional(),
    exposes: z
      .object({
        artifacts: z.array(z.string()),
      })
      .passthrough()
      .optional(),
    constraints: z.array(z.string()).optional(),
  })
  .passthrough();
export type TeamInterface = z.infer<typeof TeamInterfaceSchema>;
