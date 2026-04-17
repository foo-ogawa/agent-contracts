import type { GenerateDiagnostic } from "./types.js";

export interface PathResolveResult {
  resolved: string;
  diagnostics: GenerateDiagnostic[];
}

export function resolveBindingTargetPath(
  target: string,
  paths: Record<string, string>,
  bindingSoftware: string,
): PathResolveResult {
  const diagnostics: GenerateDiagnostic[] = [];
  const resolved = target.replace(/\{(\w+)\}/g, (match, varName: string) => {
    const value = paths[varName];
    if (value === undefined) {
      diagnostics.push({
        path: `binding.${bindingSoftware}.outputs`,
        message: `Path variable "${varName}" used in target "${target}" but not defined in config.paths`,
        severity: "error",
      });
      return match;
    }
    return value;
  });
  return { resolved, diagnostics };
}
