import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import { generateInterface } from "../../src/interface-generator/index.js";
import { DslSchema, type Dsl } from "../../src/schema/index.js";

function dslWithInterface(overrides: Partial<Record<string, unknown>> = {}): Dsl {
  const base = {
    version: 1,
    system: {
      id: "team-backend",
      name: "Backend Team",
      default_workflow_order: ["impl"],
    },
    agents: { a1: { role_name: "R", purpose: "P" } },
    artifacts: {
      spec: {
        type: "doc",
        owner: "a1",
        producers: ["a1"],
        editors: ["a1"],
        consumers: ["a1"],
        states: ["draft", "approved"],
        description: "Specification artifact",
      },
    },
    handoff_types: {
      in: { version: 1, schema: { type: "object" }, description: "Inbound" },
      out: { version: 1, schema: { type: "object" } },
      unused: { version: 1, schema: { type: "object" } },
    },
    workflow: {
      impl: {
        steps: [{ type: "handoff" as const, handoff_kind: "task-delegation" }],
      },
    },
    team_interface: {
      version: 3,
      description: "Public contract",
      accepts: {
        workflows: {
          implement: {
            internal_workflow: "impl",
            input_handoff: "in",
            output_handoff: "out",
          },
        },
      },
      exposes: { artifacts: ["spec"] },
      constraints: ["must include acceptance_criteria"],
    },
  };
  return DslSchema.parse({ ...base, ...overrides } as Record<string, unknown>);
}

describe("generateInterface", () => {
  it("generates YAML with team_id, team_name, version, and generated_at", () => {
    const dsl = dslWithInterface();
    const { content } = generateInterface({ dsl, dryRun: true, format: "yaml" });
    const doc = parseYaml(content) as Record<string, unknown>;
    expect(doc.team_id).toBe("team-backend");
    expect(doc.team_name).toBe("Backend Team");
    expect(doc.version).toBe(3);
    expect(typeof doc.generated_at).toBe("string");
    expect(doc.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("generates JSON when format is json", () => {
    const dsl = dslWithInterface();
    const { content } = generateInterface({ dsl, dryRun: true, format: "json" });
    const doc = JSON.parse(content) as Record<string, unknown>;
    expect(doc.team_id).toBe("team-backend");
    expect(doc.version).toBe(3);
  });

  it("includes only handoff_types referenced by accepted workflows", () => {
    const dsl = dslWithInterface();
    const { content } = generateInterface({ dsl, dryRun: true, format: "yaml" });
    const doc = parseYaml(content) as Record<string, unknown>;
    const ht = doc.handoff_types as Record<string, unknown>;
    expect(Object.keys(ht).sort()).toEqual(["in", "out"]);
    expect(ht.unused).toBeUndefined();
  });

  it("includes exposed artifacts with type, description, and states", () => {
    const dsl = dslWithInterface();
    const { content } = generateInterface({ dsl, dryRun: true, format: "yaml" });
    const doc = parseYaml(content) as Record<string, unknown>;
    const exposed = (doc.exposes as { artifacts: Record<string, unknown> }).artifacts
      .spec as Record<string, unknown>;
    expect(exposed.type).toBe("doc");
    expect(exposed.description).toBe("Specification artifact");
    expect(exposed.states).toEqual(["draft", "approved"]);
  });

  it("includes constraints from team_interface", () => {
    const dsl = dslWithInterface();
    const { content } = generateInterface({ dsl, dryRun: true, format: "yaml" });
    const doc = parseYaml(content) as Record<string, unknown>;
    expect(doc.constraints).toEqual(["must include acceptance_criteria"]);
  });

  it("throws when DSL has no team_interface", () => {
    const dsl = DslSchema.parse({
      version: 1,
      system: { id: "s", name: "S", default_workflow_order: [] },
    });
    expect(() =>
      generateInterface({ dsl, dryRun: true, format: "yaml" }),
    ).toThrow("DSL has no team_interface section");
  });

  it("omits handoff_types when no workflows are accepted", () => {
    const dsl = dslWithInterface({
      team_interface: { version: 1 },
    });
    const { content } = generateInterface({ dsl, dryRun: true, format: "yaml" });
    const doc = parseYaml(content) as Record<string, unknown>;
    expect(doc.handoff_types).toBeUndefined();
  });

  it("omits exposes when no artifacts are exposed", () => {
    const dsl = dslWithInterface({
      team_interface: {
        version: 1,
        accepts: {
          workflows: {
            w: {
              internal_workflow: "impl",
              input_handoff: "in",
              output_handoff: "out",
            },
          },
        },
      },
    });
    const { content } = generateInterface({ dsl, dryRun: true, format: "yaml" });
    const doc = parseYaml(content) as Record<string, unknown>;
    expect(doc.exposes).toBeUndefined();
    expect(doc.handoff_types).toBeDefined();
  });
});
