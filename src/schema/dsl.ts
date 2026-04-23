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

export const SCOPE_NODE_TYPES = [
  "root",
  "system",
  "agent",
  "task",
  "execution_step",
  "artifact",
  "tool",
  "tool_command",
  "validation",
  "handoff_type",
  "workflow",
  "workflow_step",
  "policy",
  "guardrail",
  "guardrail_policy",
  "rule",
  "escalation_criterion",
  "prerequisite",
] as const;

export type ScopeNodeType = (typeof SCOPE_NODE_TYPES)[number];

export const ScopeNodeTypeSchema = z.enum(SCOPE_NODE_TYPES);

/**
 * Declaration of project-specific `x-*` extension fields.
 * Each key must start with `x-` and describes the expected type/shape
 * so that tooling can validate custom extensions in the future.
 */
export const XExtensionDeclSchema = z.object({
  type: z.string(),
  items: z.string().optional(),
  description: z.string().optional(),
  scope: z.array(ScopeNodeTypeSchema).optional(),
  schema: z.record(z.string(), z.any()).optional(),
  required: z.boolean().default(false),
});
export type XExtensionDecl = z.infer<typeof XExtensionDeclSchema>;

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
    extensions: z
      .record(z.string(), XExtensionDeclSchema)
      .default({}),
    extensions_strict: z.boolean().default(false),
  })
  .passthrough();
export type Dsl = z.infer<typeof DslSchema>;
