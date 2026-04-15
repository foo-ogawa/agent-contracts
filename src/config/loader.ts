import { readFile, access } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { parse as parseYaml } from "yaml";
import { AgentContractsConfigSchema, type ResolvedConfig } from "./types.js";

const DEFAULT_CONFIG_NAME = "agent-contracts.config.yaml";

export class ConfigLoadError extends Error {
  constructor(
    message: string,
    public readonly filePath?: string,
  ) {
    super(message);
    this.name = "ConfigLoadError";
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function loadConfig(
  configPath?: string,
): Promise<ResolvedConfig | null> {
  const isExplicit = configPath !== undefined;
  const targetPath = resolve(configPath ?? DEFAULT_CONFIG_NAME);

  if (!(await fileExists(targetPath))) {
    if (isExplicit) {
      throw new ConfigLoadError(
        `Config file not found: ${targetPath}`,
        targetPath,
      );
    }
    return null;
  }

  let content: string;
  try {
    content = await readFile(targetPath, "utf8");
  } catch {
    throw new ConfigLoadError(
      `Failed to read config file: ${targetPath}`,
      targetPath,
    );
  }

  let raw: unknown;
  try {
    raw = parseYaml(content);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ConfigLoadError(
      `Invalid YAML syntax in ${targetPath}: ${msg}`,
      targetPath,
    );
  }

  const result = AgentContractsConfigSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new ConfigLoadError(
      `Invalid config in ${targetPath}:\n${issues}`,
      targetPath,
    );
  }

  const configDir = dirname(targetPath);
  const config = result.data;

  return {
    dsl: resolve(configDir, config.dsl),
    vars: config.vars,
    renders: config.renders.map((r) => ({
      ...r,
      template: resolve(configDir, r.template),
      output: resolve(configDir, r.output),
    })),
    configDir,
  };
}

export function resolveDslPath(
  dirArg: string | undefined,
  dirArgDefault: string,
  config: ResolvedConfig | null,
): string {
  if (dirArg !== undefined && dirArg !== dirArgDefault) {
    return resolve(dirArg);
  }
  if (config) {
    return config.dsl;
  }
  return resolve(dirArgDefault);
}
