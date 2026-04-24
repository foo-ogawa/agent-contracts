import { stringify } from "yaml";
import type { Dsl } from "../schema/index.js";

export interface GenerateInterfaceOptions {
  dsl: Dsl;
  output?: string;
  dryRun: boolean;
  format: "yaml" | "json";
}

export interface GenerateInterfaceResult {
  outputPath: string;
  content: string;
}

function buildInterfaceDocument(dsl: Dsl, generatedAt: string): Record<string, unknown> {
  const ti = dsl.team_interface!;
  const doc: Record<string, unknown> = {
    team_id: dsl.system.id,
    team_name: dsl.system.name,
    version: ti.version,
    generated_at: generatedAt,
  };

  if (ti.description !== undefined) {
    doc.description = ti.description;
  }

  if (ti.accepts?.workflows && Object.keys(ti.accepts.workflows).length > 0) {
    doc.accepts = { workflows: { ...ti.accepts.workflows } };
  }

  const handoffKeys = new Set<string>();
  if (ti.accepts?.workflows) {
    for (const spec of Object.values(ti.accepts.workflows)) {
      handoffKeys.add(spec.input_handoff);
      handoffKeys.add(spec.output_handoff);
    }
  }

  const handoff_types: Record<string, unknown> = {};
  for (const k of [...handoffKeys].sort()) {
    const ht = dsl.handoff_types[k];
    if (ht) {
      const entry: Record<string, unknown> = {
        version: ht.version,
        schema: ht.schema,
      };
      if (ht.description !== undefined) {
        entry.description = ht.description;
      }
      handoff_types[k] = entry;
    }
  }
  if (Object.keys(handoff_types).length > 0) {
    doc.handoff_types = handoff_types;
  }

  const artifactsOut: Record<string, unknown> = {};
  if (ti.exposes?.artifacts) {
    for (const key of [...ti.exposes.artifacts].sort()) {
      const art = dsl.artifacts[key];
      if (art) {
        const entry: Record<string, unknown> = {
          type: art.type,
          states: art.states,
        };
        if (art.description !== undefined) {
          entry.description = art.description;
        }
        artifactsOut[key] = entry;
      }
    }
  }
  if (Object.keys(artifactsOut).length > 0) {
    doc.exposes = { artifacts: artifactsOut };
  }

  if (ti.constraints !== undefined && ti.constraints.length > 0) {
    doc.constraints = ti.constraints;
  }

  return doc;
}

export function generateInterface(options: GenerateInterfaceOptions): GenerateInterfaceResult {
  if (!options.dsl.team_interface) {
    throw new Error("DSL has no team_interface section");
  }

  const doc = buildInterfaceDocument(options.dsl, new Date().toISOString());
  const content =
    options.format === "json"
      ? `${JSON.stringify(doc, null, 2)}\n`
      : `${stringify(doc, { sortMapEntries: true })}\n`;

  const outputPath = options.output ?? "team-interface.yaml";

  return { outputPath, content };
}
