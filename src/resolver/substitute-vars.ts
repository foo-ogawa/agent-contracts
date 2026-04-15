const VAR_PATTERN = /\$\{vars\.([a-zA-Z0-9_-]+)\}/g;

export class VarsSubstitutionError extends Error {
  constructor(
    public readonly varName: string,
    public readonly sourceValue: string,
    public readonly definedVars: string[],
  ) {
    const defined =
      definedVars.length > 0 ? definedVars.join(", ") : "(none)";
    super(
      `Undefined variable "${varName}" in value "${sourceValue}"\n  Defined vars: ${defined}`,
    );
    this.name = "VarsSubstitutionError";
  }
}

function substituteString(
  value: string,
  vars: Record<string, string>,
): string {
  return value.replace(VAR_PATTERN, (match, varName: string) => {
    if (!(varName in vars)) {
      throw new VarsSubstitutionError(varName, value, Object.keys(vars));
    }
    return vars[varName];
  });
}

function walk(data: unknown, vars: Record<string, string>): unknown {
  if (typeof data === "string") return substituteString(data, vars);
  if (Array.isArray(data)) return data.map((item) => walk(item, vars));
  if (data !== null && typeof data === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(
      data as Record<string, unknown>,
    )) {
      result[key] = walk(value, vars);
    }
    return result;
  }
  return data;
}

export function substituteVars(
  data: Record<string, unknown>,
  vars: Record<string, string>,
): Record<string, unknown> {
  return walk(data, vars) as Record<string, unknown>;
}
