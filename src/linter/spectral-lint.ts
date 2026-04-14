import { Spectral } from "@stoplight/spectral-core";
import spectralRuleset from "./spectral/ruleset.js";
import type { LintDiagnostic, Severity } from "./types.js";

const severityMap: Record<number, Severity> = {
  0: "error",
  1: "warning",
  2: "info",
  3: "info",
};

let spectralInstance: Spectral | null = null;

function getSpectral(): Spectral {
  if (!spectralInstance) {
    spectralInstance = new Spectral();
    spectralInstance.setRuleset(spectralRuleset);
  }
  return spectralInstance;
}

/**
 * Run Spectral rules on a resolved DSL object.
 * Returns diagnostics in the same format as the TypeScript linter.
 */
export async function spectralLint(
  dslObject: Record<string, unknown>,
): Promise<LintDiagnostic[]> {
  const spectral = getSpectral();
  const results = await spectral.run(dslObject);

  return results.map((r) => ({
    ruleId: r.code as string,
    severity: severityMap[r.severity] ?? "info",
    path: r.path.join("."),
    message: r.message,
  }));
}
