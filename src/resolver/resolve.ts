import { dirname, resolve as resolvePath } from "node:path";
import { loadDsl } from "../loader/index.js";
import { resolveBase } from "./base-resolver.js";
import { mergeDsl } from "./merger.js";

export interface ResolveResult {
  data: Record<string, unknown>;
  projectPath: string;
  basePath?: string;
}

export async function resolve(
  projectDirOrFile: string,
): Promise<ResolveResult> {
  const absPath = resolvePath(projectDirOrFile);
  const projectResult = await loadDsl(absPath);
  const projectData = projectResult.data;

  const extendsValue = projectData["extends"];
  if (typeof extendsValue !== "string") {
    return {
      data: projectData,
      projectPath: projectResult.filePath,
    };
  }

  const projectDir = dirname(projectResult.filePath);
  const baseResult = await resolveBase(extendsValue, projectDir);
  const merged = mergeDsl(baseResult.data, projectData);

  return {
    data: merged,
    projectPath: projectResult.filePath,
    basePath: baseResult.filePath,
  };
}
