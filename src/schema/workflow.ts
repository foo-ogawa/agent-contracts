import { z } from "zod";

const WorkflowHandoffStepSchema = z
  .object({
    type: z.literal("handoff"),
    description: z.string().optional(),
    handoff_kind: z.string(),
    task: z.string().optional(),
    from_agent: z.string().optional(),
  })
  .passthrough();

const WorkflowValidationStepSchema = z
  .object({
    type: z.literal("validation"),
    description: z.string().optional(),
    validation: z.string(),
  })
  .passthrough();

const WorkflowDecisionStepSchema = z
  .object({
    type: z.literal("decision"),
    description: z.string().optional(),
    on: z.string(),
    branches: z.record(z.string(), z.array(z.string())),
  })
  .passthrough();

export const WorkflowStepSchema = z.discriminatedUnion("type", [
  WorkflowHandoffStepSchema,
  WorkflowValidationStepSchema,
  WorkflowDecisionStepSchema,
]);
export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;

export const WorkflowSchema = z
  .object({
    description: z.string().optional(),
    entry_conditions: z.array(z.string()).default([]),
    trigger: z.string().optional(),
    steps: z.array(WorkflowStepSchema),
  })
  .passthrough();
export type Workflow = z.infer<typeof WorkflowSchema>;
