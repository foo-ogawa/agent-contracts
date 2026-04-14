import { z } from "zod";
import { AgentSchema } from "./agent.js";
import { ArtifactSchema } from "./artifact.js";
import { HandoffTypeSchema } from "./handoff-type.js";
import { PolicySchema } from "./policy.js";
import { SystemSchema } from "./system.js";
import { TaskSchema } from "./task.js";
import { ToolSchema } from "./tool.js";
import { ValidationSchema } from "./validation.js";
import { WorkflowSchema } from "./workflow.js";

export const DslSchema = z
  .object({
    version: z.literal(1),
    extends: z.string().optional(),
    system: SystemSchema,
    agents: z.record(z.string(), AgentSchema).default({}),
    tasks: z.record(z.string(), TaskSchema).default({}),
    artifacts: z.record(z.string(), ArtifactSchema).default({}),
    tools: z.record(z.string(), ToolSchema).default({}),
    validations: z.record(z.string(), ValidationSchema).default({}),
    handoff_types: z.record(z.string(), HandoffTypeSchema).default({}),
    workflow: z.record(z.string(), WorkflowSchema).default({}),
    policies: z.record(z.string(), PolicySchema).default({}),
  })
  .passthrough();
export type Dsl = z.infer<typeof DslSchema>;
