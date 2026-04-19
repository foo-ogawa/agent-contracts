import { describe, it, expect } from "vitest";
import { expandDefaults } from "../../src/resolver/expand-defaults.js";

describe("expandDefaults", () => {
  it("fills Zod default arrays on a minimal DSL", () => {
    const data: Record<string, unknown> = {
      version: 1,
      system: { id: "s", name: "S", default_workflow_order: [] },
    };
    const expanded = expandDefaults(data);
    expect(expanded["agents"]).toEqual({});
    expect(expanded["tasks"]).toEqual({});
    expect(expanded["artifacts"]).toEqual({});
    expect(expanded["tools"]).toEqual({});
    expect(expanded["validations"]).toEqual({});
    expect(expanded["handoff_types"]).toEqual({});
    expect(expanded["workflow"]).toEqual({});
    expect(expanded["policies"]).toEqual({});
    expect(expanded["guardrails"]).toEqual({});
    expect(expanded["guardrail_policies"]).toEqual({});
  });

  it("fills nested default arrays in agents", () => {
    const data: Record<string, unknown> = {
      version: 1,
      system: { id: "s", name: "S", default_workflow_order: [] },
      agents: {
        a1: { role_name: "R", purpose: "P" },
      },
    };
    const expanded = expandDefaults(data);
    const agent = (expanded["agents"] as Record<string, Record<string, unknown>>)["a1"];
    expect(agent["can_read_artifacts"]).toEqual([]);
    expect(agent["can_write_artifacts"]).toEqual([]);
    expect(agent["can_execute_tools"]).toEqual([]);
    expect(agent["can_invoke_agents"]).toEqual([]);
    expect(agent["can_return_handoffs"]).toEqual([]);
  });

  it("fills workflow entry_conditions and external_participants defaults", () => {
    const data: Record<string, unknown> = {
      version: 1,
      system: { id: "s", name: "S", default_workflow_order: ["impl"] },
      workflow: {
        impl: {
          steps: [{ type: "gate", gate_kind: "evidence-gate" }],
        },
      },
    };
    const expanded = expandDefaults(data);
    const wf = (expanded["workflow"] as Record<string, Record<string, unknown>>)["impl"];
    expect(wf["entry_conditions"]).toEqual([]);
    expect(wf["external_participants"]).toEqual([]);
  });

  it("preserves existing values and does not overwrite them", () => {
    const data: Record<string, unknown> = {
      version: 1,
      system: { id: "s", name: "S", default_workflow_order: ["impl"] },
      agents: {
        a1: { role_name: "R", purpose: "P", can_read_artifacts: ["art1"] },
      },
    };
    const expanded = expandDefaults(data);
    const agent = (expanded["agents"] as Record<string, Record<string, unknown>>)["a1"];
    expect(agent["can_read_artifacts"]).toEqual(["art1"]);
  });

  it("returns original data when schema parsing fails", () => {
    const badData = { invalid: true } as unknown as Record<string, unknown>;
    const result = expandDefaults(badData);
    expect(result).toEqual(badData);
  });
});
