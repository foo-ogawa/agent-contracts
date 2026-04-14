import { z } from "zod";

export const VersionLiteralSchema = z.literal(1);
export type VersionLiteral = z.infer<typeof VersionLiteralSchema>;

export const ExtendsSchema = z.string().optional();
export type Extends = z.infer<typeof ExtendsSchema>;

export const SystemSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    default_workflow_order: z.array(z.string()),
  })
  .passthrough();
export type System = z.infer<typeof SystemSchema>;
