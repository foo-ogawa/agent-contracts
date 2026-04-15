import { describe, it, expect } from "vitest";
import {
  substituteVars,
  VarsSubstitutionError,
} from "../../src/resolver/substitute-vars.js";

describe("substituteVars", () => {
  const vars = {
    project_name: "my-service",
    language: "TypeScript",
    repo_url: "https://github.com/org/my-service",
  };

  it("substitutes a single variable in a string", () => {
    const data = { purpose: "Implements ${vars.project_name}" };
    const result = substituteVars(data, vars);
    expect(result.purpose).toBe("Implements my-service");
  });

  it("substitutes multiple variables in a single string", () => {
    const data = {
      desc: "${vars.project_name} uses ${vars.language}",
    };
    const result = substituteVars(data, vars);
    expect(result.desc).toBe("my-service uses TypeScript");
  });

  it("substitutes variables in nested objects", () => {
    const data = {
      agents: {
        impl: {
          purpose: "Build ${vars.project_name}",
          meta: { lang: "${vars.language}" },
        },
      },
    };
    const result = substituteVars(data, vars) as Record<string, unknown>;
    const agents = result.agents as Record<string, Record<string, unknown>>;
    expect(agents.impl.purpose).toBe("Build my-service");
    expect((agents.impl.meta as Record<string, string>).lang).toBe(
      "TypeScript",
    );
  });

  it("substitutes variables in arrays", () => {
    const data = {
      constraints: [
        "Use ${vars.language}",
        "Repo: ${vars.repo_url}",
      ],
    };
    const result = substituteVars(data, vars);
    expect(result.constraints).toEqual([
      "Use TypeScript",
      "Repo: https://github.com/org/my-service",
    ]);
  });

  it("substitutes variables in arrays nested inside objects", () => {
    const data = {
      agents: {
        dev: {
          constraints: ["Use ${vars.language} only"],
        },
      },
    };
    const result = substituteVars(data, vars) as Record<string, unknown>;
    const agents = result.agents as Record<string, Record<string, unknown>>;
    expect(agents.dev.constraints).toEqual(["Use TypeScript only"]);
  });

  it("leaves non-string values unchanged", () => {
    const data = {
      version: 1,
      enabled: true,
      count: null,
      name: "${vars.project_name}",
    };
    const result = substituteVars(data, vars);
    expect(result.version).toBe(1);
    expect(result.enabled).toBe(true);
    expect(result.count).toBeNull();
    expect(result.name).toBe("my-service");
  });

  it("returns data as-is when no placeholders exist", () => {
    const data = { purpose: "No placeholders here" };
    const result = substituteVars(data, vars);
    expect(result.purpose).toBe("No placeholders here");
  });

  it("handles empty vars (no placeholders to resolve)", () => {
    const data = { purpose: "No placeholders" };
    const result = substituteVars(data, {});
    expect(result.purpose).toBe("No placeholders");
  });

  it("throws VarsSubstitutionError for undefined variable", () => {
    const data = { purpose: "Uses ${vars.unknown_var}" };
    expect(() => substituteVars(data, vars)).toThrow(VarsSubstitutionError);
    try {
      substituteVars(data, vars);
    } catch (err) {
      const e = err as VarsSubstitutionError;
      expect(e.varName).toBe("unknown_var");
      expect(e.sourceValue).toBe("Uses ${vars.unknown_var}");
      expect(e.definedVars).toEqual(Object.keys(vars));
    }
  });

  it("throws VarsSubstitutionError with '(none)' when vars is empty", () => {
    const data = { purpose: "${vars.foo}" };
    expect(() => substituteVars(data, {})).toThrow(VarsSubstitutionError);
    expect(() => substituteVars(data, {})).toThrow("(none)");
  });

  it("does not substitute similar but non-matching patterns", () => {
    const data = {
      a: "${env.HOME}",
      b: "$vars.project_name",
      c: "{vars.project_name}",
      d: "#{vars.project_name}",
      e: "{{vars.project_name}}",
    };
    const result = substituteVars(data, vars);
    expect(result.a).toBe("${env.HOME}");
    expect(result.b).toBe("$vars.project_name");
    expect(result.c).toBe("{vars.project_name}");
    expect(result.d).toBe("#{vars.project_name}");
    expect(result.e).toBe("{{vars.project_name}}");
  });

  it("supports hyphenated variable names", () => {
    const data = { name: "${vars.my-project}" };
    const result = substituteVars(data, { "my-project": "cool" });
    expect(result.name).toBe("cool");
  });

  it("handles the same variable used multiple times", () => {
    const data = {
      desc: "${vars.project_name} and ${vars.project_name}",
    };
    const result = substituteVars(data, vars);
    expect(result.desc).toBe("my-service and my-service");
  });

  it("does not modify object keys", () => {
    const data = { "${vars.project_name}": "value" };
    const result = substituteVars(data, vars);
    expect(result["${vars.project_name}"]).toBe("value");
    expect(result["my-service"]).toBeUndefined();
  });
});
