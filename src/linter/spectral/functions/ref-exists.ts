import { createRulesetFunction } from "@stoplight/spectral-core";

type RefExistsOptions = {
  /** JSONPath-like key in the root document that holds the target map */
  referenceTo: string;
};

/**
 * Validates that each string in the target value (single string or string[])
 * is a key in the specified top-level map of the document.
 */
export default createRulesetFunction<string | string[], RefExistsOptions>(
  {
    input: null,
    options: {
      type: "object",
      properties: {
        referenceTo: { type: "string" },
      },
      required: ["referenceTo"],
      additionalProperties: false,
    },
  },
  (targetVal, options, context) => {
    const root = context.document.data as Record<string, unknown>;
    const catalog = root[options.referenceTo];
    if (typeof catalog !== "object" || catalog === null) return [];

    const keys = new Set(Object.keys(catalog));
    const values = Array.isArray(targetVal) ? targetVal : [targetVal];
    const results: { message: string; path: (string | number)[] }[] = [];

    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (typeof v !== "string") continue;
      if (!keys.has(v)) {
        const path = Array.isArray(targetVal)
          ? [...context.path, i]
          : [...context.path];
        results.push({
          message: `"${v}" does not exist in ${options.referenceTo}`,
          path,
        });
      }
    }
    return results;
  },
);
