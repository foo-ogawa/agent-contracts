import { z } from "zod";

export const CONTEXT_TYPES = [
  "agent",
  "task",
  "artifact",
  "tool",
  "validation",
  "handoff_type",
  "workflow",
  "policy",
  "guardrail",
  "guardrail_policy",
  "system",
] as const;

export const ContextTypeSchema = z.enum(CONTEXT_TYPES);
export type ContextType = z.infer<typeof ContextTypeSchema>;

export const ITERABLE_CONTEXT_TYPES = CONTEXT_TYPES.filter(
  (t): t is Exclude<ContextType, "system"> => t !== "system",
);

export const RenderTargetSchema = z
  .object({
    template: z.string(),
    context: ContextTypeSchema,
    output: z.string(),
    include: z.array(z.string()).optional(),
    exclude: z.array(z.string()).optional(),
  })
  .refine(
    (data) => !(data.include && data.exclude),
    { message: "include and exclude are mutually exclusive" },
  )
  .refine(
    (data) => {
      if (data.context === "system" && (data.include || data.exclude)) {
        return false;
      }
      return true;
    },
    { message: "include/exclude cannot be used with context: system" },
  );

export type RenderTarget = z.infer<typeof RenderTargetSchema>;

export const AgentContractsConfigSchema = z.object({
  dsl: z.string(),
  vars: z.record(z.string(), z.string()).optional(),
  renders: z.array(RenderTargetSchema).min(1),
  bindings: z.array(z.string()).default([]),
  active_guardrail_policy: z.string().optional(),
  paths: z.record(z.string(), z.string()).optional(),
});

export type AgentContractsConfig = z.infer<typeof AgentContractsConfigSchema>;

export interface ResolvedRenderTarget {
  template: string;
  context: ContextType;
  output: string;
  include?: string[];
  exclude?: string[];
}

export interface ResolvedConfig {
  dsl: string;
  vars?: Record<string, string>;
  renders: ResolvedRenderTarget[];
  configDir: string;
  bindings: string[];
  activeGuardrailPolicy?: string;
  paths?: Record<string, string>;
}
