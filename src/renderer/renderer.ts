import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import Handlebars from "handlebars";
import type { Dsl } from "../schema/index.js";
import type { ResolvedRenderTarget, ContextType } from "../config/types.js";
import {
  buildPerAgentContext,
  buildSystemContext,
  buildTaskContext,
  buildArtifactContext,
  buildToolContext,
  buildValidationContext,
  buildHandoffTypeContext,
  buildWorkflowContext,
  buildPolicyContext,
} from "./context.js";

Handlebars.registerHelper("eq", (a: unknown, b: unknown) => a === b);

Handlebars.registerHelper("notEmpty", (obj: unknown) => {
  if (!obj || typeof obj !== "object") return false;
  return Object.keys(obj as Record<string, unknown>).length > 0;
});

Handlebars.registerHelper("inc", (val: number) => val + 1);

interface PayloadFieldInfo {
  name: string;
  type: string;
  required: boolean;
  enum?: string;
}

Handlebars.registerHelper(
  "lookupPayloadFields",
  (payload: Record<string, unknown>): PayloadFieldInfo[] => {
    const props = payload?.["properties"] as
      | Record<string, Record<string, unknown>>
      | undefined;
    if (!props) return [];
    const requiredSet = new Set(
      (payload["required"] as string[] | undefined) ?? [],
    );
    return Object.entries(props).map(([name, schema]) => {
      const enumVals = schema["enum"] as string[] | undefined;
      return {
        name,
        type: (schema["type"] as string) ?? "any",
        required: requiredSet.has(name),
        enum: enumVals ? enumVals.join(" | ") : undefined,
      };
    });
  },
);

function toYamlLines(obj: unknown, indent: number): string[] {
  const pad = "  ".repeat(indent);
  if (obj === null || obj === undefined) return [`${pad}null`];
  if (typeof obj === "boolean" || typeof obj === "number")
    return [`${pad}${obj}`];
  if (typeof obj === "string") {
    if (obj.includes("\n")) {
      const lines = [`${pad}|`];
      for (const line of obj.split("\n")) {
        lines.push(line === "" ? "" : `${pad}  ${line}`);
      }
      return lines;
    }
    return [`${pad}${JSON.stringify(obj)}`];
  }
  if (Array.isArray(obj)) {
    const lines: string[] = [];
    for (const item of obj) {
      if (typeof item === "object" && item !== null && !Array.isArray(item)) {
        const entries = Object.entries(item as Record<string, unknown>);
        if (entries.length > 0) {
          const [firstKey, firstVal] = entries[0];
          const firstValLines = toYamlLines(firstVal, 0);
          if (firstValLines.length === 1 && !firstValLines[0].includes("\n")) {
            lines.push(`${pad}- ${firstKey}: ${firstValLines[0].trim()}`);
          } else {
            lines.push(`${pad}- ${firstKey}:`);
            lines.push(...toYamlLines(firstVal, indent + 2));
          }
          for (let i = 1; i < entries.length; i++) {
            const [k, v] = entries[i];
            const vLines = toYamlLines(v, indent + 2);
            if (vLines.length === 1) {
              lines.push(`${pad}  ${k}: ${vLines[0].trim()}`);
            } else {
              lines.push(`${pad}  ${k}:`);
              lines.push(...vLines);
            }
          }
        } else {
          lines.push(`${pad}- {}`);
        }
      } else {
        const valLines = toYamlLines(item, 0);
        lines.push(`${pad}- ${valLines[0].trim()}`);
      }
    }
    return lines;
  }
  if (typeof obj === "object") {
    const lines: string[] = [];
    for (const [key, value] of Object.entries(
      obj as Record<string, unknown>,
    )) {
      const valLines = toYamlLines(value, indent + 1);
      if (valLines.length === 1 && !valLines[0].includes("|")) {
        lines.push(`${pad}${key}: ${valLines[0].trim()}`);
      } else {
        lines.push(`${pad}${key}:`);
        lines.push(...valLines);
      }
    }
    return lines;
  }
  return [`${pad}${String(obj)}`];
}

Handlebars.registerHelper("yamlBlock", (obj: unknown): string => {
  return toYamlLines(obj, 0).join("\n");
});

function getDslSection(dsl: Dsl, context: ContextType): Record<string, unknown> {
  const sectionMap: Record<string, Record<string, unknown>> = {
    agent: dsl.agents,
    task: dsl.tasks,
    artifact: dsl.artifacts,
    tool: dsl.tools,
    validation: dsl.validations,
    handoff_type: dsl.handoff_types,
    workflow: dsl.workflow,
    policy: dsl.policies,
  };
  return sectionMap[context] ?? {};
}

function filterIds(
  allIds: string[],
  include?: string[],
  exclude?: string[],
): string[] {
  if (include) return allIds.filter((id) => include.includes(id));
  if (exclude) return allIds.filter((id) => !exclude.includes(id));
  return allIds;
}

function expandOutputPath(pattern: string, context: ContextType, entityId: string): string {
  return pattern.replace(new RegExp(`\\{${context}\\.id\\}`, "g"), entityId);
}

function buildEntityContext(
  dsl: Dsl,
  context: ContextType,
  entityId: string,
): Record<string, unknown> {
  switch (context) {
    case "agent": {
      const agentDef = dsl.agents[entityId];
      const agentWithId = { ...agentDef, id: entityId };
      return buildPerAgentContext(dsl, agentWithId);
    }
    case "task":
      return buildTaskContext(dsl, entityId);
    case "artifact":
      return buildArtifactContext(dsl, entityId);
    case "tool":
      return buildToolContext(dsl, entityId);
    case "validation":
      return buildValidationContext(dsl, entityId);
    case "handoff_type":
      return buildHandoffTypeContext(dsl, entityId);
    case "workflow":
      return buildWorkflowContext(dsl, entityId);
    case "policy":
      return buildPolicyContext(dsl, entityId);
    case "system":
      return buildSystemContext(dsl);
  }
}

async function loadTemplate(templatePath: string): Promise<string> {
  return readFile(templatePath, "utf8");
}

export async function renderFromConfig(
  dsl: Dsl,
  renderTargets: ResolvedRenderTarget[],
): Promise<string[]> {
  const outputFiles: string[] = [];

  for (const target of renderTargets) {
    const templateContent = await loadTemplate(target.template);
    const compiled = Handlebars.compile(templateContent, { noEscape: false });

    if (target.context === "system") {
      const ctx = buildSystemContext(dsl);
      const output = compiled(ctx);
      await mkdir(dirname(target.output), { recursive: true });
      await writeFile(target.output, output, "utf8");
      outputFiles.push(target.output);
    } else {
      const section = getDslSection(dsl, target.context);
      const allIds = Object.keys(section);
      const ids = filterIds(allIds, target.include, target.exclude);

      for (const entityId of ids) {
        const ctx = buildEntityContext(dsl, target.context, entityId);
        const output = compiled(ctx);
        const outputPath = expandOutputPath(target.output, target.context, entityId);
        await mkdir(dirname(outputPath), { recursive: true });
        await writeFile(outputPath, output, "utf8");
        outputFiles.push(outputPath);
      }
    }
  }

  return outputFiles;
}

export async function checkDriftFromConfig(
  dsl: Dsl,
  renderTargets: ResolvedRenderTarget[],
): Promise<{ hasDrift: boolean; diffs: string[] }> {
  const diffs: string[] = [];

  for (const target of renderTargets) {
    const templateContent = await loadTemplate(target.template);
    const compiled = Handlebars.compile(templateContent, { noEscape: false });

    if (target.context === "system") {
      const ctx = buildSystemContext(dsl);
      const expected = compiled(ctx);
      try {
        const existing = await readFile(target.output, "utf8");
        if (existing !== expected) diffs.push(target.output);
      } catch {
        diffs.push(target.output);
      }
    } else {
      const section = getDslSection(dsl, target.context);
      const allIds = Object.keys(section);
      const ids = filterIds(allIds, target.include, target.exclude);

      for (const entityId of ids) {
        const ctx = buildEntityContext(dsl, target.context, entityId);
        const expected = compiled(ctx);
        const outputPath = expandOutputPath(target.output, target.context, entityId);
        try {
          const existing = await readFile(outputPath, "utf8");
          if (existing !== expected) diffs.push(outputPath);
        } catch {
          diffs.push(outputPath);
        }
      }
    }
  }

  return { hasDrift: diffs.length > 0, diffs };
}
