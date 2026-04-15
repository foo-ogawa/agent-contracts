import { z } from "zod";

const RetrySchema = z.object({
  condition: z.string(),
  fix_task: z.string(),
  revalidate_task: z.string().optional(),
});
export type Retry = z.infer<typeof RetrySchema>;

const ExternalParticipantSchema = z.object({
  id: z.string(),
  kind: z.enum(["actor", "participant"]),
  label: z.string(),
  description: z.string().optional(),
});
export type ExternalParticipant = z.infer<typeof ExternalParticipantSchema>;

const WorkflowHandoffStepSchema = z
  .object({
    type: z.literal("handoff"),
    description: z.string().optional(),
    handoff_kind: z.string(),
    task: z.string().optional(),
    from_agent: z.string().optional(),
    group: z.string().optional(),
    retry: RetrySchema.optional(),
  })
  .passthrough();

const WorkflowValidationStepSchema = z
  .object({
    type: z.literal("validation"),
    description: z.string().optional(),
    validation: z.string(),
    group: z.string().optional(),
  })
  .passthrough();

const WorkflowDecisionStepSchema = z
  .object({
    type: z.literal("decision"),
    description: z.string().optional(),
    on: z.string(),
    branches: z.record(z.string(), z.array(z.string())),
    group: z.string().optional(),
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
    external_participants: z.array(ExternalParticipantSchema).default([]),
  })
  .passthrough();
export type Workflow = z.infer<typeof WorkflowSchema>;
