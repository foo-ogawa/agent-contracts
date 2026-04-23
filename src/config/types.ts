import { z } from "zod";

export {
  CONTEXT_TYPES,
  ContextTypeSchema,
  ITERABLE_CONTEXT_TYPES,
  type ContextType,
} from "../schema/context-type.js";

import { ContextTypeSchema, type ContextType } from "../schema/context-type.js";

export const RenderTargetSchema = z
  .object({
    template: z.string(),
    context: ContextTypeSchema,
    output: z.string(),
    include: z.array(z.string()).optional(),
    exclude: z.array(z.string()).optional(),
    skip_empty: z.boolean().optional(),
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
  renders: z.array(RenderTargetSchema).default([]),
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
  skip_empty?: boolean;
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
