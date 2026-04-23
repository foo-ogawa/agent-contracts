import type {
  Agent,
  Artifact,
  Guardrail,
  GuardrailPolicy,
  GuardrailPolicyRule,
  HandoffType,
  SoftwareBinding,
  Task,
  Check,
  Workflow,
} from "../schema/index.js";

export interface ResolvedCheck {
  guardrail_id: string;
  guardrail: Guardrail;
  policy_rule: GuardrailPolicyRule;
  check: Check;
}

export interface BindingGenerationContext {
  system: { id: string; name: string };
  guardrails: Record<string, Guardrail>;
  policy: GuardrailPolicy;
  binding: SoftwareBinding;
  all_bindings: Record<string, SoftwareBinding>;
  vars: Record<string, string>;
  paths: Record<string, string>;
  reporting: {
    commands: Record<string, string>;
    fail_open: boolean;
    timeout_ms: number;
  } | null;
  resolved_checks: ResolvedCheck[];

  tasks: Record<string, Task>;
  artifacts: Record<string, Artifact>;
  agents: Record<string, Agent>;
  handoff_types: Record<string, HandoffType>;
  workflow: Record<string, Workflow>;
}

/** @deprecated Use BindingGenerationContext */
export type GuardrailGenerationContext = BindingGenerationContext;

export interface GenerateResult {
  outputFiles: string[];
  diagnostics: GenerateDiagnostic[];
}

export interface GenerateDiagnostic {
  path: string;
  message: string;
  severity: "error" | "warning" | "info";
}
