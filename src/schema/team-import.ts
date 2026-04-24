import { z } from "zod";

export const TeamImportSchema = z
  .object({
    interface: z.string(),
    version: z.string().optional(),
  })
  .passthrough();
export type TeamImport = z.infer<typeof TeamImportSchema>;
