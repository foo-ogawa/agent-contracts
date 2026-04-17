import type {
  Guardrail,
  GuardrailPolicy,
  GuardrailPolicyRule,
  SoftwareBinding,
  Check,
} from "../schema/index.js";

export interface ResolvedCheck {
  guardrail_id: string;
  guardrail: Guardrail;
  policy_rule: GuardrailPolicyRule;
  check: Check;
}

export interface GuardrailGenerationContext {
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
}

export interface GenerateResult {
  outputFiles: string[];
  diagnostics: GenerateDiagnostic[];
}

export interface GenerateDiagnostic {
  path: string;
  message: string;
  severity: "error" | "warning" | "info";
}
