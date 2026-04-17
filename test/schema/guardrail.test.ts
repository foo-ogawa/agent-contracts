import { describe, expect, it } from "vitest";
import {
  BindingOutputSchema,
  CheckSchema,
  GuardrailPolicyRuleEscalationSchema,
  GuardrailPolicyRuleSchema,
  GuardrailPolicySchema,
  GuardrailSchema,
  MatcherSchema,
  ReportingSchema,
  SoftwareBindingSchema,
} from "../../src/schema/index.js";

describe("GuardrailSchema", () => {
  it("parses minimal valid guardrail (description + scope only)", () => {
    const g = GuardrailSchema.parse({
      description: "No secrets in prompts",
      scope: {},
    });
    expect(g.description).toBe("No secrets in prompts");
    expect(g.scope).toEqual({});
    expect(g.tags).toEqual([]);
  });

  it("parses full guardrail with all fields", () => {
    const g = GuardrailSchema.parse({
      description: "Full guardrail",
      scope: {
        agents: ["architect"],
        tasks: ["implement"],
        tools: ["bash"],
        artifacts: ["spec.md"],
        workflows: ["implement"],
      },
      rationale: "Security baseline",
      tags: ["security", "pii"],
      exemptions: ["emergency-break-glass"],
    });
    expect(g.scope.agents).toEqual(["architect"]);
    expect(g.scope.tasks).toEqual(["implement"]);
    expect(g.scope.tools).toEqual(["bash"]);
    expect(g.scope.artifacts).toEqual(["spec.md"]);
    expect(g.scope.workflows).toEqual(["implement"]);
    expect(g.rationale).toBe("Security baseline");
    expect(g.tags).toEqual(["security", "pii"]);
    expect(g.exemptions).toEqual(["emergency-break-glass"]);
  });

  it("defaults tags to [] when omitted", () => {
    const g = GuardrailSchema.parse({
      description: "d",
      scope: {},
    });
    expect(g.tags).toEqual([]);
  });

  it("rejects missing description", () => {
    const r = GuardrailSchema.safeParse({ scope: {} });
    expect(r.success).toBe(false);
  });

  it("rejects missing scope", () => {
    const r = GuardrailSchema.safeParse({ description: "d" });
    expect(r.success).toBe(false);
  });

  it("allows x- passthrough properties", () => {
    const g = GuardrailSchema.parse({
      description: "d",
      scope: {},
      "x-guardrail-meta": { tier: 1 },
    });
    expect((g as Record<string, unknown>)["x-guardrail-meta"]).toEqual({
      tier: 1,
    });
  });

  it("scope allows passthrough properties", () => {
    const g = GuardrailSchema.parse({
      description: "d",
      scope: { agents: ["a"], "x-scope-extra": true },
    });
    expect((g.scope as Record<string, unknown>)["x-scope-extra"]).toBe(true);
  });
});

describe("GuardrailPolicySchema", () => {
  const minimalRule = {
    guardrail: "gr-1",
    severity: "mandatory" as const,
    action: "warn" as const,
  };

  it("parses minimal policy (rules array with one rule)", () => {
    const p = GuardrailPolicySchema.parse({
      rules: [minimalRule],
    });
    expect(p.rules).toHaveLength(1);
    expect(p.rules[0].allow_override).toBe(false);
  });

  it("parses full policy with description and multiple rules", () => {
    const p = GuardrailPolicySchema.parse({
      description: "Org defaults",
      rules: [
        { ...minimalRule, guardrail: "a" },
        {
          guardrail: "b",
          severity: "info",
          action: "info",
          allow_override: true,
          override_requires: ["lead"],
        },
      ],
    });
    expect(p.description).toBe("Org defaults");
    expect(p.rules).toHaveLength(2);
    expect(p.rules[1].override_requires).toEqual(["lead"]);
  });

  it("accepts all severity values", () => {
    const severities = ["critical", "mandatory", "warning", "info"] as const;
    for (const severity of severities) {
      const p = GuardrailPolicySchema.parse({
        rules: [{ guardrail: "g", severity, action: "info" }],
      });
      expect(p.rules[0].severity).toBe(severity);
    }
  });

  it("accepts all action values", () => {
    const actions = ["block", "warn", "shadow", "info"] as const;
    for (const action of actions) {
      const p = GuardrailPolicySchema.parse({
        rules: [{ guardrail: "g", severity: "info", action }],
      });
      expect(p.rules[0].action).toBe(action);
    }
  });

  it("defaults allow_override to false", () => {
    const p = GuardrailPolicySchema.parse({ rules: [minimalRule] });
    expect(p.rules[0].allow_override).toBe(false);
  });

  it("parses escalation with target and condition", () => {
    const p = GuardrailPolicySchema.parse({
      rules: [
        {
          ...minimalRule,
          escalation: { target: "human-review", condition: "twice" },
        },
      ],
    });
    expect(p.rules[0].escalation).toEqual({
      target: "human-review",
      condition: "twice",
    });
  });

  it("rejects invalid severity", () => {
    const r = GuardrailPolicyRuleSchema.safeParse({
      guardrail: "g",
      severity: "fatal",
      action: "block",
    });
    expect(r.success).toBe(false);
  });

  it("rejects invalid action", () => {
    const r = GuardrailPolicyRuleSchema.safeParse({
      guardrail: "g",
      severity: "critical",
      action: "halt",
    });
    expect(r.success).toBe(false);
  });

  it("rejects missing guardrail in rule", () => {
    const r = GuardrailPolicyRuleSchema.safeParse({
      severity: "critical",
      action: "block",
    });
    expect(r.success).toBe(false);
  });

  it("allows passthrough on policy and rules", () => {
    const p = GuardrailPolicySchema.parse({
      rules: [
        {
          ...minimalRule,
          "x-rule-note": "alpha",
        },
      ],
      "x-policy-note": "beta",
    });
    expect((p as Record<string, unknown>)["x-policy-note"]).toBe("beta");
    expect((p.rules[0] as Record<string, unknown>)["x-rule-note"]).toBe(
      "alpha",
    );
  });
});

describe("GuardrailPolicyRuleEscalationSchema", () => {
  it("parses minimal escalation", () => {
    const e = GuardrailPolicyRuleEscalationSchema.parse({
      target: "owner",
    });
    expect(e.target).toBe("owner");
    expect(e.condition).toBeUndefined();
  });

  it("allows passthrough on escalation", () => {
    const e = GuardrailPolicyRuleEscalationSchema.parse({
      target: "t",
      "x-esc": 1,
    });
    expect((e as Record<string, unknown>)["x-esc"]).toBe(1);
  });
});

describe("MatcherSchema", () => {
  it("parses command_regex matcher", () => {
    const m = MatcherSchema.parse({
      type: "command_regex",
      pattern: "^rm\\s",
    });
    expect(m.type).toBe("command_regex");
    if (m.type === "command_regex") {
      expect(m.pattern).toBe("^rm\\s");
    }
  });

  it("parses content_regex matcher with file_glob and exclude_glob", () => {
    const m = MatcherSchema.parse({
      type: "content_regex",
      pattern: "API_KEY",
      file_glob: "**/*.ts",
      exclude_glob: "**/vendor/**",
    });
    expect(m.type).toBe("content_regex");
    if (m.type === "content_regex") {
      expect(m.pattern).toBe("API_KEY");
      expect(m.file_glob).toBe("**/*.ts");
      expect(m.exclude_glob).toBe("**/vendor/**");
    }
  });

  it("parses file_glob matcher", () => {
    const m = MatcherSchema.parse({
      type: "file_glob",
      pattern: "*.pem",
    });
    expect(m.type).toBe("file_glob");
    if (m.type === "file_glob") {
      expect(m.pattern).toBe("*.pem");
    }
  });

  it("rejects unknown type", () => {
    const r = MatcherSchema.safeParse({
      type: "unknown_matcher",
      pattern: "x",
    });
    expect(r.success).toBe(false);
  });
});

describe("CheckSchema", () => {
  it("parses with matcher only", () => {
    const c = CheckSchema.parse({
      matcher: { type: "file_glob", pattern: "*.key" },
    });
    expect(c.matcher?.type).toBe("file_glob");
  });

  it("parses with script only", () => {
    const c = CheckSchema.parse({ script: "scripts/check.sh" });
    expect(c.script).toBe("scripts/check.sh");
  });

  it("parses with message", () => {
    const c = CheckSchema.parse({ message: "Do not commit credentials" });
    expect(c.message).toBe("Do not commit credentials");
  });

  it("allows passthrough fields (hook_event, git_hook, etc.)", () => {
    const c = CheckSchema.parse({
      hook_event: "pre_commit",
      git_hook: "pre-commit",
    });
    expect((c as Record<string, unknown>).hook_event).toBe("pre_commit");
    expect((c as Record<string, unknown>).git_hook).toBe("pre-commit");
  });

  it("parses empty check (all optional)", () => {
    const c = CheckSchema.parse({});
    expect(c.matcher).toBeUndefined();
    expect(c.script).toBeUndefined();
    expect(c.message).toBeUndefined();
  });
});

describe("BindingOutputSchema", () => {
  it("parses with template", () => {
    const o = BindingOutputSchema.parse({
      target: "out.md",
      template: "tmpl.md",
    });
    expect(o.template).toBe("tmpl.md");
    expect(o.inline_template).toBeUndefined();
  });

  it("parses with inline_template", () => {
    const o = BindingOutputSchema.parse({
      target: "out.md",
      inline_template: "{{name}}",
    });
    expect(o.inline_template).toBe("{{name}}");
  });

  it('defaults mode to "write"', () => {
    const o = BindingOutputSchema.parse({ target: "t" });
    expect(o.mode).toBe("write");
  });

  it('accepts mode "patch"', () => {
    const o = BindingOutputSchema.parse({
      target: "t",
      mode: "patch",
    });
    expect(o.mode).toBe("patch");
  });

  it("rejects both template AND inline_template (mutual exclusion refine)", () => {
    const r = BindingOutputSchema.safeParse({
      target: "t",
      template: "a",
      inline_template: "b",
    });
    expect(r.success).toBe(false);
  });

  it("parses with group_by and executable", () => {
    const o = BindingOutputSchema.parse({
      target: "reports/*.md",
      group_by: "session",
      executable: false,
    });
    expect(o.group_by).toBe("session");
    expect(o.executable).toBe(false);
  });

  it("allows passthrough", () => {
    const o = BindingOutputSchema.parse({
      target: "t",
      "x-output-meta": { priority: 2 },
    });
    expect((o as Record<string, unknown>)["x-output-meta"]).toEqual({
      priority: 2,
    });
  });
});

describe("ReportingSchema", () => {
  it("parses with commands, defaults fail_open and timeout_ms", () => {
    const r = ReportingSchema.parse({
      commands: { lint: "npm run lint" },
    });
    expect(r.commands).toEqual({ lint: "npm run lint" });
    expect(r.fail_open).toBe(true);
    expect(r.timeout_ms).toBe(5000);
  });

  it("parses with explicit fail_open and timeout_ms", () => {
    const r = ReportingSchema.parse({
      commands: { a: "b" },
      fail_open: false,
      timeout_ms: 12000,
    });
    expect(r.fail_open).toBe(false);
    expect(r.timeout_ms).toBe(12000);
  });

  it("rejects missing commands", () => {
    const r = ReportingSchema.safeParse({
      fail_open: true,
      timeout_ms: 1000,
    });
    expect(r.success).toBe(false);
  });

  it("allows passthrough", () => {
    const r = ReportingSchema.parse({
      commands: { x: "y" },
      "x-reporting": true,
    });
    expect((r as Record<string, unknown>)["x-reporting"]).toBe(true);
  });
});

describe("SoftwareBindingSchema", () => {
  it("parses minimal binding (software + version: 1)", () => {
    const b = SoftwareBindingSchema.parse({
      software: "cursor-hooks",
      version: 1,
    });
    expect(b.software).toBe("cursor-hooks");
    expect(b.version).toBe(1);
  });

  it("parses full binding with guardrail_impl, outputs, reporting, extends", () => {
    const b = SoftwareBindingSchema.parse({
      software: "observ-cli",
      version: 1,
      extends: "@org/base-binding",
      guardrail_impl: {
        "no-secrets": {
          checks: [
            {
              matcher: { type: "content_regex", pattern: "BEGIN RSA" },
            },
          ],
        },
      },
      outputs: {
        report: {
          target: "quality.md",
          template: "tmpl.md",
          mode: "patch",
        },
      },
      reporting: {
        commands: { emit: "observ emit" },
        fail_open: false,
        timeout_ms: 3000,
      },
    });
    expect(b.extends).toBe("@org/base-binding");
    expect(Object.keys(b.guardrail_impl ?? {})).toEqual(["no-secrets"]);
    expect(b.outputs?.report.mode).toBe("patch");
    expect(b.reporting?.commands.emit).toBe("observ emit");
  });

  it("rejects wrong version number", () => {
    const r = SoftwareBindingSchema.safeParse({
      software: "s",
      version: 2,
    });
    expect(r.success).toBe(false);
  });

  it("rejects missing software", () => {
    const r = SoftwareBindingSchema.safeParse({
      version: 1,
    });
    expect(r.success).toBe(false);
  });

  it("allows passthrough", () => {
    const b = SoftwareBindingSchema.parse({
      software: "s",
      version: 1,
      "x-binding-meta": "extra",
    });
    expect((b as Record<string, unknown>)["x-binding-meta"]).toBe("extra");
  });
});
