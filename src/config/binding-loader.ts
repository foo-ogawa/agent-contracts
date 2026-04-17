import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import {
  SoftwareBindingSchema,
  type SoftwareBinding,
} from "../schema/index.js";
import { ConfigLoadError } from "./loader.js";

export interface LoadedBinding {
  filePath: string;
  binding: SoftwareBinding;
}

export async function loadBindings(
  bindingPaths: string[],
): Promise<LoadedBinding[]> {
  const results: LoadedBinding[] = [];
  for (const filePath of bindingPaths) {
    let content: string;
    try {
      content = await readFile(filePath, "utf8");
    } catch {
      throw new ConfigLoadError(
        `Failed to read binding file: ${filePath}`,
        filePath,
      );
    }

    let raw: unknown;
    try {
      raw = parseYaml(content);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new ConfigLoadError(
        `Invalid YAML syntax in binding file ${filePath}: ${msg}`,
        filePath,
      );
    }

    const result = SoftwareBindingSchema.safeParse(raw);
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
