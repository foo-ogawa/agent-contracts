import { z } from "zod";
import { AgentSchema } from "./agent.js";
import { ArtifactSchema } from "./artifact.js";
import { HandoffTypeSchema } from "./handoff-type.js";
import { GuardrailPolicySchema, GuardrailSchema } from "./guardrail.js";
import { PolicySchema } from "./policy.js";
import { SystemSchema } from "./system.js";
import { TaskSchema } from "./task.js";
import { ToolSchema } from "./tool.js";
import { ValidationSchema } from "./validation.js";
import { WorkflowSchema } from "./workflow.js";

/**
 * Reusable schema components, following the OpenAPI `components` pattern.
 *
 * `schemas` is a map of named JSON Schema fragments that can be referenced
 * from anywhere in the document via `$ref: "#/components/schemas/<name>"`.
 */
export const ComponentsSchema = z
  .object({
    schemas: z.record(z.string(), z.record(z.string(), z.any())).default({}),
  })
  .passthrough();
export type Components = z.infer<typeof ComponentsSchema>;

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
    guardrails: z.record(z.string(), GuardrailSchema).default({}),
    guardrail_policies: z
      .record(z.string(), GuardrailPolicySchema)
      .default({}),
    components: ComponentsSchema.default({ schemas: {} }),
  })
  .passthrough();
export type Dsl = z.infer<typeof DslSchema>;
