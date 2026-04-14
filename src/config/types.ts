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
  renders: z.array(RenderTargetSchema).min(1),
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
  renders: ResolvedRenderTarget[];
  configDir: string;
}
