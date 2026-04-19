import { z } from "zod";

const CommandRegexMatcherSchema = z
  .object({
    type: z.literal("command_regex"),
    pattern: z.string(),
  })
  .passthrough();

const ContentRegexMatcherSchema = z
  .object({
    type: z.literal("content_regex"),
    pattern: z.string(),
    file_glob: z.string().optional(),
    exclude_glob: z.string().optional(),
  })
  .passthrough();

const FileGlobMatcherSchema = z
  .object({
    type: z.literal("file_glob"),
    pattern: z.string(),
    exclude_glob: z.string().optional(),
  })
  .passthrough();

export const MatcherSchema = z.discriminatedUnion("type", [
  CommandRegexMatcherSchema,
  ContentRegexMatcherSchema,
  FileGlobMatcherSchema,
]);
export type Matcher = z.infer<typeof MatcherSchema>;

export const CheckSchema = z
  .object({
    matcher: MatcherSchema.optional(),
    script: z.string().optional(),
    message: z.string().optional(),
  })
  .passthrough();
export type Check = z.infer<typeof CheckSchema>;

export const BindingOutputSchema = z
  .object({
    target: z.string(),
    template: z.string().optional(),
    inline_template: z.string().optional(),
    mode: z.enum(["write", "patch"]).default("write"),
    group_by: z.string().optional(),
    executable: z.boolean().optional(),
  })
  .passthrough()
  .refine(
    (data) => !(data.template && data.inline_template),
    { message: "template and inline_template are mutually exclusive" },
  );
export type BindingOutput = z.infer<typeof BindingOutputSchema>;

export const ReportingSchema = z
  .object({
    commands: z.record(z.string(), z.string()),
    fail_open: z.boolean().default(true),
    timeout_ms: z.number().default(5000),
  })
  .passthrough();
export type Reporting = z.infer<typeof ReportingSchema>;

const GuardrailImplSchema = z.object({
  checks: z.array(CheckSchema),
});

export const SoftwareBindingSchema = z
  .object({
    software: z.string(),
    version: z.literal(1),
    extends: z.string().optional(),
    guardrail_impl: z.record(z.string(), GuardrailImplSchema).optional(),
    outputs: z.record(z.string(), BindingOutputSchema).optional(),
    reporting: ReportingSchema.optional(),
  })
  .passthrough();
export type SoftwareBinding = z.infer<typeof SoftwareBindingSchema>;
