import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { parse as parseYaml } from "yaml";
import { describe, it, expect } from "vitest";
import { validateSchema } from "../../src/validator/schema-validator.js";
import { checkReferences } from "../../src/validator/reference-resolver.js";
import { DslSchema } from "../../src/schema/index.js";

const fixturesDir = resolve(import.meta.dirname, "../fixtures");

function loadFixture(rel: string): Record<string, unknown> {
  return parseYaml(readFileSync(join(fixturesDir, rel), "utf8")) as Record<string, unknown>;
}

describe("validateSchema", () => {
  it("succeeds on valid minimal fixture", () => {
    const data = loadFixture("minimal/agent-contracts.yaml");
    const result = validateSchema(data);
    expect(result.success).toBe(true);
    expect(result.diagnostics).toHaveLength(0);
  });

  it("succeeds on valid full fixture", () => {
    const data = loadFixture("full/agent-contracts.yaml");
    const result = validateSchema(data);
    expect(result.success).toBe(true);
  });

  it("returns diagnostics for invalid schema", () => {
    const data = loadFixture("invalid/missing-required.yaml");
    const result = validateSchema(data);
    expect(result.success).toBe(false);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.diagnostics[0].code).toBe("schema-validation");
  });

  it("passes x- prefix properties through", () => {
    const data = loadFixture("full/agent-contracts.yaml");
    const result = validateSchema(data);
    expect(result.success).toBe(true);
    if (result.data) {
      const arch = result.data.agents["main-architect"];
      expect((arch as Record<string, unknown>)["x-identity"]).toBeDefined();
    }
  });

  it("rejects non-x- custom properties", () => {
    const data = {
      version: 1,
      system: { id: "s", name: "S", default_phase_order: [] },
      agents: {
        a: { role_name: "R", purpose: "P", custom_field: "bad" },
      },
    };
    const result = validateSchema(data);
    expect(result.success).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "unknown-property")).toBe(true);
    expect(result.diagnostics.some((d) => d.message.includes("custom_field"))).toBe(true);
  });
});

describe("checkReferences", () => {
  it("returns no reference-not-found diagnostics for full fixture", () => {
    const data = loadFixture("full/agent-contracts.yaml");
    const parsed = DslSchema.parse(data);
    const diagnostics = checkReferences(parsed);
    const refErrors = diagnostics.filter((d) => d.code === "reference-not-found");
    expect(refErrors).toHaveLength(0);
  });

  it("detects non-existent agent reference in artifact.owner", () => {
    const dsl = DslSchema.parse({
      version: 1,
      system: { id: "s", name: "S", default_phase_order: ["implement"] },
      agents: { a1: { role_name: "R", purpose: "P" } },
      artifacts: {
        art1: {
          type: "code",
          owner: "nonexistent",
          producers: ["a1"],
          editors: ["a1"],
          consumers: ["a1"],
          states: ["draft"],
        },
      },
    });
    const diagnostics = checkReferences(dsl);
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics.some((d) => d.message.includes("nonexistent"))).toBe(true);
  });

  it("detects non-existent tool in agent.can_execute_tools", () => {
    const dsl = DslSchema.parse({
      version: 1,
      system: { id: "s", name: "S", default_phase_order: [] },
      agents: {
        a1: { role_name: "R", purpose: "P", can_execute_tools: ["missing-tool"] },
      },
    });
    const diagnostics = checkReferences(dsl);
    expect(diagnostics.some((d) => d.message.includes("missing-tool"))).toBe(true);
  });

  it("detects non-existent agent in task.target_agent", () => {
    const dsl = DslSchema.parse({
      version: 1,
      system: { id: "s", name: "S", default_phase_order: ["impl"] },
      agents: { a1: { role_name: "R", purpose: "P" } },
      tasks: {
        t1: {
          description: "d",
          target_agent: "nonexistent",
          allowed_from_agents: ["a1"],
          phase: "impl",
          input_artifacts: [],
          invocation_handoff: "h",
          result_handoff: "r",
        },
      },
      handoff_types: {
        h: { version: 1, payload: {} },
        r: { version: 1, payload: {} },
      },
    });
    const diagnostics = checkReferences(dsl);
    expect(diagnostics.some((d) => d.message.includes("nonexistent"))).toBe(true);
  });

  it("detects non-existent validation in workflow step", () => {
    const dsl = DslSchema.parse({
      version: 1,
      system: { id: "s", name: "S", default_phase_order: ["impl"] },
      workflow: {
        impl: {
          steps: [
            { type: "validation", validation: "missing-val" },
          ],
        },
      },
    });
    const diagnostics = checkReferences(dsl);
    expect(diagnostics.some((d) => d.message.includes("missing-val"))).toBe(true);
  });

  it("detects artifact owner without read permission (artifact-owner-no-read)", () => {
    const dsl = DslSchema.parse({
      version: 1,
      system: { id: "s", name: "S", default_phase_order: ["p"] },
      agents: { owner: { role_name: "R", purpose: "P", can_read_artifacts: [] } },
      artifacts: {
        art1: {
          type: "code",
          owner: "owner",
          producers: ["owner"],
          editors: ["owner"],
          consumers: ["owner"],
          states: ["draft"],
        },
      },
    });
    const diagnostics = checkReferences(dsl);
    expect(diagnostics.some((d) => d.code === "artifact-owner-no-read")).toBe(true);
    expect(diagnostics.some((d) => d.message.includes("cannot read"))).toBe(true);
  });

  it("allows artifact owner with read permission (no artifact-owner-no-read)", () => {
    const dsl = DslSchema.parse({
      version: 1,
      system: { id: "s", name: "S", default_phase_order: ["p"] },
      agents: { owner: { role_name: "R", purpose: "P", can_read_artifacts: ["art1"] } },
      artifacts: {
        art1: {
          type: "code",
          owner: "owner",
          producers: ["owner"],
          editors: ["owner"],
          consumers: ["owner"],
          states: ["draft"],
        },
      },
    });
    const diagnostics = checkReferences(dsl);
    expect(diagnostics.filter((d) => d.code === "artifact-owner-no-read")).toHaveLength(0);
  });

  it("detects tool validation executor with empty invokable_by (validation-executor-unreachable)", () => {
    const dsl = DslSchema.parse({
      version: 1,
      system: { id: "s", name: "S", default_phase_order: ["p"] },
      agents: { a1: { role_name: "R", purpose: "P", can_read_artifacts: ["art1"] } },
      artifacts: {
        art1: {
          type: "code",
          owner: "a1",
          producers: ["a1"],
          editors: ["a1"],
          consumers: ["a1"],
          states: ["draft"],
          required_validations: ["v1"],
        },
      },
      tools: { tool1: { kind: "lint", invokable_by: [] } },
      validations: {
        v1: {
          target_artifact: "art1",
          kind: "schema",
          executor_type: "tool",
          executor: "tool1",
          blocking: false,
        },
      },
    });
    const diagnostics = checkReferences(dsl);
    expect(diagnostics.some((d) => d.code === "validation-executor-unreachable")).toBe(true);
    expect(diagnostics.some((d) => d.message.includes("invokable_by"))).toBe(true);
  });

  it("detects result_handoff not in target agent can_return_handoffs (result-handoff-not-returnable)", () => {
    const dsl = DslSchema.parse({
      version: 1,
      system: { id: "s", name: "S", default_phase_order: ["p"] },
      agents: {
        a1: { role_name: "R", purpose: "P", can_return_handoffs: ["inv"] },
      },
      tasks: {
        t1: {
          description: "d",
          target_agent: "a1",
          allowed_from_agents: ["a1"],
          phase: "p",
          input_artifacts: [],
          invocation_handoff: "inv",
          result_handoff: "res",
        },
      },
      handoff_types: {
        inv: { version: 1, payload: {} },
        res: { version: 1, payload: {} },
      },
    });
    const diagnostics = checkReferences(dsl);
    expect(diagnostics.some((d) => d.code === "result-handoff-not-returnable")).toBe(true);
    expect(diagnostics.some((d) => d.message.includes("can_return_handoffs"))).toBe(true);
  });

  it("detects input_artifact not in target agent can_read_artifacts (input-artifact-not-readable)", () => {
    const dsl = DslSchema.parse({
      version: 1,
      system: { id: "s", name: "S", default_phase_order: ["p"] },
      agents: {
        a1: { role_name: "R", purpose: "P", can_read_artifacts: ["art1"], can_return_handoffs: ["inv", "res"] },
        a2: { role_name: "R", purpose: "P", can_read_artifacts: ["art2"] },
      },
      artifacts: {
        art1: { type: "code", owner: "a1", producers: ["a1"], editors: ["a1"], consumers: ["a1"], states: ["draft"] },
        art2: { type: "code", owner: "a2", producers: ["a2"], editors: ["a2"], consumers: ["a2"], states: ["draft"] },
      },
      tasks: {
        t1: {
          description: "d",
          target_agent: "a1",
          allowed_from_agents: ["a1"],
          phase: "p",
          input_artifacts: ["art2"],
          invocation_handoff: "inv",
          result_handoff: "res",
        },
      },
      handoff_types: {
        inv: { version: 1, payload: {} },
        res: { version: 1, payload: {} },
      },
    });
    const diagnostics = checkReferences(dsl);
    expect(diagnostics.some((d) => d.code === "input-artifact-not-readable")).toBe(true);
    expect(diagnostics.some((d) => d.message.includes("can_read_artifacts"))).toBe(true);
  });

  it("detects read-only agent with non-empty can_write_artifacts (readonly-agent-has-writes)", () => {
    const dsl = DslSchema.parse({
      version: 1,
      system: { id: "s", name: "S", default_phase_order: ["p"] },
      agents: {
        a1: { role_name: "R", purpose: "P", mode: "read-only", can_read_artifacts: ["art1"], can_write_artifacts: ["art1"] },
      },
      artifacts: {
        art1: { type: "code", owner: "a1", producers: ["a1"], editors: ["a1"], consumers: ["a1"], states: ["draft"] },
      },
    });
    const diagnostics = checkReferences(dsl);
    expect(diagnostics.some((d) => d.code === "readonly-agent-has-writes")).toBe(true);
    expect(diagnostics.some((d) => d.message.includes("read-only"))).toBe(true);
  });

  it("detects prerequisite target not in can_read_artifacts (prerequisite-not-readable)", () => {
    const dsl = DslSchema.parse({
      version: 1,
      system: { id: "s", name: "S", default_phase_order: ["p"] },
      agents: {
        a1: { role_name: "R", purpose: "P", can_read_artifacts: [], prerequisites: [{ action: "read", target: "art1", required: true }] },
        a2: { role_name: "R", purpose: "P", can_read_artifacts: ["art1"] },
      },
      artifacts: {
        art1: { type: "code", owner: "a2", producers: ["a2"], editors: ["a2"], consumers: ["a2"], states: ["draft"] },
      },
    });
    const diagnostics = checkReferences(dsl);
    expect(diagnostics.some((d) => d.code === "prerequisite-not-readable")).toBe(true);
    expect(diagnostics.some((d) => d.message.includes("Prerequisite target"))).toBe(true);
  });

  it("detects payload required field missing from properties (payload-required-not-in-properties)", () => {
    const dsl = DslSchema.parse({
      version: 1,
      system: { id: "s", name: "S", default_phase_order: [] },
      handoff_types: {
        h: {
          version: 1,
          payload: {
            required: ["missingKey"],
            properties: { other: { type: "string" } },
          },
        },
      },
    });
    const diagnostics = checkReferences(dsl);
    expect(diagnostics.some((d) => d.code === "payload-required-not-in-properties")).toBe(true);
    expect(diagnostics.some((d) => d.message.includes("missingKey"))).toBe(true);
  });

  it("detects payload property with empty enum (payload-empty-enum)", () => {
    const dsl = DslSchema.parse({
      version: 1,
      system: { id: "s", name: "S", default_phase_order: [] },
      handoff_types: {
        h: {
          version: 1,
          payload: {
            properties: {
              status: { type: "string", enum: [] },
            },
          },
        },
      },
    });
    const diagnostics = checkReferences(dsl);
    expect(diagnostics.some((d) => d.code === "payload-empty-enum")).toBe(true);
    expect(diagnostics.some((d) => d.message.includes("empty enum"))).toBe(true);
  });

  it("returns no diagnostics when all new integrity rules are satisfied", () => {
    const dsl = DslSchema.parse({
      version: 1,
      system: { id: "s", name: "S", default_phase_order: ["p"] },
      agents: {
        a1: { role_name: "R", purpose: "P", can_read_artifacts: ["art1"], can_return_handoffs: ["inv", "res"], prerequisites: [{ action: "read", target: "art1", required: true }] },
      },
      artifacts: {
        art1: { type: "code", owner: "a1", producers: ["a1"], editors: ["a1"], consumers: ["a1"], states: ["draft"], required_validations: ["v1"] },
      },
      tools: { tool1: { kind: "lint", invokable_by: ["a1"] } },
      validations: {
        v1: { target_artifact: "art1", kind: "schema", executor_type: "tool", executor: "tool1", blocking: false },
      },
      tasks: {
        t1: { description: "d", target_agent: "a1", allowed_from_agents: ["a1"], phase: "p", input_artifacts: ["art1"], invocation_handoff: "inv", result_handoff: "res" },
      },
      handoff_types: {
        inv: { version: 1, payload: { required: ["taskId"], properties: { taskId: { type: "string" } } } },
        res: { version: 1, payload: { properties: { outcome: { type: "string", enum: ["ok", "fail"] } } } },
      },
    });
    const diagnostics = checkReferences(dsl);
    expect(diagnostics).toHaveLength(0);
  });
});
