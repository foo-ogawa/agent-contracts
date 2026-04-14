export type OutputFormat = "text" | "json";

export interface FormatOptions {
  format: OutputFormat;
  quiet: boolean;
}

export function formatDiagnostics(
  diagnostics: Array<{ path: string; message: string; severity?: string; ruleId?: string; code?: string }>,
  options: FormatOptions,
): string {
  if (options.quiet && diagnostics.length === 0) return "";

  if (options.format === "json") {
    return JSON.stringify(diagnostics, null, 2);
  }

  return diagnostics
    .map((d) => {
      const severity = d.severity ?? d.code ?? "error";
      const rule = d.ruleId ?? d.code ?? "";
      return `${d.path}: ${severity} [${rule}] ${d.message}`;
    })
    .join("\n");
}
