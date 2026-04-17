import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { stat } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import {
  SoftwareBindingSchema,
  type SoftwareBinding,
} from "../schema/index.js";
import { ConfigLoadError } from "./loader.js";
import { mergeBinding } from "./binding-merger.js";

export interface LoadedBinding {
  filePath: string;
  binding: SoftwareBinding;
}

async function loadRawBinding(filePath: string): Promise<Record<string, unknown>> {
  let content: string;
  try {
    content = await readFile(filePath, "utf8");
  } catch {
    throw new ConfigLoadError(
      `Failed to read binding file: ${filePath}`,
      filePath,
    );
  }

  try {
    return parseYaml(content) as Record<string, unknown>;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ConfigLoadError(
      `Invalid YAML syntax in binding file ${filePath}: ${msg}`,
      filePath,
    );
  }
}

async function resolveBindingExtends(
  raw: Record<string, unknown>,
  filePath: string,
  seen: Set<string>,
): Promise<Record<string, unknown>> {
  const extendsValue = raw["extends"];
  if (typeof extendsValue !== "string") {
    return raw;
  }

  const bindingDir = dirname(filePath);
  let basePath: string;

  if (extendsValue.startsWith("./") || extendsValue.startsWith("../")) {
    basePath = resolve(bindingDir, extendsValue);
  } else {
    try {
      const resolved = import.meta.resolve(extendsValue);
      basePath = new URL(resolved).pathname;
    } catch {
      throw new ConfigLoadError(
        `Could not resolve binding extends package: ${extendsValue}`,
        filePath,
      );
    }
  }

  // If the resolved path is a directory, look for a binding YAML entry file
  try {
    const s = await stat(basePath);
    if (s.isDirectory()) {
      const candidates = ["binding.yaml", "binding.yml"];
      let found = false;
      for (const name of candidates) {
        const candidate = resolve(basePath, name);
        try {
          const cs = await stat(candidate);
          if (cs.isFile()) {
            basePath = candidate;
            found = true;
            break;
          }
        } catch {
          continue;
        }
      }
      if (!found) {
        throw new ConfigLoadError(
          `No binding.yaml found in directory: ${basePath}`,
          filePath,
        );
      }
    }
  } catch (err) {
    if (err instanceof ConfigLoadError) throw err;
    throw new ConfigLoadError(
      `Base binding path not found: ${basePath}`,
      filePath,
    );
  }

  if (seen.has(basePath)) {
    throw new ConfigLoadError(
      `Circular binding extends detected: ${basePath}`,
      filePath,
    );
  }
  seen.add(basePath);

  const baseRaw = await loadRawBinding(basePath);
  const resolvedBase = await resolveBindingExtends(baseRaw, basePath, seen);

  return mergeBinding(resolvedBase, raw);
}

export async function loadBindings(
  bindingPaths: string[],
): Promise<LoadedBinding[]> {
  const results: LoadedBinding[] = [];
  for (const filePath of bindingPaths) {
    const raw = await loadRawBinding(filePath);
    const merged = await resolveBindingExtends(raw, filePath, new Set([filePath]));

    const result = SoftwareBindingSchema.safeParse(merged);
    if (!result.success) {
      const issues = result.error.issues
        .map((i) => `  ${i.path.join(".")}: ${i.message}`)
        .join("\n");
      throw new ConfigLoadError(
        `Invalid binding schema in ${filePath}:\n${issues}`,
        filePath,
      );
    }

    results.push({ filePath, binding: result.data });
  }
  return results;
}
