import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parse as parseYaml } from "yaml";

export interface LoadResult {
  data: Record<string, unknown>;
  filePath: string;
}

export class DslLoadError extends Error {
  constructor(
    message: string,
    public readonly filePath?: string,
  ) {
    super(message);
    this.name = "DslLoadError";
  }
}

const REF_ELIGIBLE_SECTIONS = [
  "agents",
  "tasks",
  "artifacts",
  "tools",
  "validations",
  "handoff_types",
  "workflow",
  "policies",
];

function isRef(value: unknown): value is { $ref: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "$ref" in value &&
    typeof (value as Record<string, unknown>)["$ref"] === "string"
  );
}

async function readYaml(filePath: string): Promise<unknown> {
  let content: string;
  try {
    content = await readFile(filePath, "utf8");
  } catch {
    throw new DslLoadError(
      `File not found: ${filePath}`,
      filePath,
    );
  }

  try {
    return parseYaml(content);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new DslLoadError(
      `Invalid YAML syntax in ${filePath}: ${msg}`,
      filePath,
    );
  }
}

async function resolveRefs(
  data: Record<string, unknown>,
  baseDir: string,
): Promise<Record<string, unknown>> {
  const resolved = { ...data };

  for (const section of REF_ELIGIBLE_SECTIONS) {
    const value = resolved[section];
    if (isRef(value)) {
      const refPath = resolve(baseDir, value.$ref);
      resolved[section] = await readYaml(refPath);
    }
  }

  return resolved;
}

function checkVersion(data: Record<string, unknown>, filePath: string): void {
  const version = data["version"];
  if (version === undefined) {
    throw new DslLoadError(
      `Missing DSL version in ${filePath}: expected version: 1`,
      filePath,
    );
  }
  if (version !== 1) {
    throw new DslLoadError(
      `Unsupported DSL version in ${filePath}: expected 1, got ${JSON.stringify(version)}`,
      filePath,
    );
  }
}

export async function loadDsl(entryPath: string): Promise<LoadResult> {
  const absPath = resolve(entryPath);
  const raw = await readYaml(absPath);

  if (typeof raw !== "object" || raw === null) {
    throw new DslLoadError(
      `Expected YAML object in ${absPath}, got ${typeof raw}`,
      absPath,
    );
  }

  const data = raw as Record<string, unknown>;
  checkVersion(data, absPath);

  const baseDir = dirname(absPath);
  const resolved = await resolveRefs(data, baseDir);

  return { data: resolved, filePath: absPath };
}
