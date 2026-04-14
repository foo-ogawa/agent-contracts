import { z } from "zod";

const WorkflowHandoffStepSchema = z
  .object({
    type: z.literal("handoff"),
    handoff_kind: z.string(),
    task: z.string().optional(),
    from_agent: z.string().optional(),
  })
  .strict();

const WorkflowValidationStepSchema = z
  .object({
    type: z.literal("validation"),
    validation: z.string(),
  })
  .strict();

const WorkflowDecisionStepSchema = z
  .object({
    type: z.literal("decision"),
    on: z.string(),
    branches: z.record(z.string(), z.array(z.string())),
  })
  .strict();

export const WorkflowStepSchema = z.discriminatedUnion("type", [
  WorkflowHandoffStepSchema,
  WorkflowValidationStepSchema,
  WorkflowDecisionStepSchema,
]);
export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;

export const WorkflowSchema = z
  .object({
    entry_conditions: z.array(z.string()).default([]),
    steps: z.array(WorkflowStepSchema),
  })
  .passthrough();
export type Workflow = z.infer<typeof WorkflowSchema>;
