import { resolve, join } from "node:path";
import { stat } from "node:fs/promises";
import { loadDsl, type LoadResult } from "../loader/index.js";

export class BaseResolveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BaseResolveError";
  }
}

async function findEntryFile(dir: string): Promise<string> {
  const candidates = ["agent-contracts.yaml", "agent-contracts.yml"];
  for (const name of candidates) {
    const p = join(dir, name);
    try {
      const s = await stat(p);
      if (s.isFile()) return p;
    } catch {
      continue;
    }
  }
  throw new BaseResolveError(
    `No agent-contracts.yaml found in directory: ${dir}`,
  );
}

export async function resolveLocalBase(
  localPath: string,
  projectDir: string,
): Promise<LoadResult> {
  const absPath = resolve(projectDir, localPath);
  const s = await stat(absPath).catch(() => null);

  if (s?.isDirectory()) {
    const entry = await findEntryFile(absPath);
    return loadDsl(entry);
  }
  if (s?.isFile()) {
    return loadDsl(absPath);
  }

  throw new BaseResolveError(
    `Base path not found: ${absPath}`,
  );
}

export async function resolvePackageBase(
  packageName: string,
): Promise<LoadResult> {
  try {
    const resolved = import.meta.resolve(packageName);
    const pkgDir = new URL(".", resolved).pathname;
    const entry = await findEntryFile(pkgDir);
    return loadDsl(entry);
  } catch {
    throw new BaseResolveError(
      `Could not resolve package: ${packageName}. Is it installed?`,
    );
  }
}

export async function resolveBase(
  extendsValue: string,
  projectDir: string,
): Promise<LoadResult> {
  if (extendsValue.startsWith("./") || extendsValue.startsWith("../")) {
    return resolveLocalBase(extendsValue, projectDir);
  }
  return resolvePackageBase(extendsValue);
}
