import { createRulesetFunction } from "@stoplight/spectral-core";

type PayloadObj = {
  required?: string[];
  properties?: Record<string, unknown>;
  [key: string]: unknown;
};

/**
 * Section 15.2.10: Handoff payload schema integrity.
 * - required fields must exist in properties
 * - enum arrays must not be empty
 * - nested objects: required fields must exist in their properties
 */
export default createRulesetFunction<PayloadObj, null>(
  { input: { type: "object" }, options: null },
  (targetVal, _options, context) => {
    const results: { message: string; path: (string | number)[] }[] = [];

    function checkObj(obj: PayloadObj, basePath: (string | number)[]) {
      const required = obj.required;
      const properties = obj.properties;

      if (
        Array.isArray(required) &&
        typeof properties === "object" &&
        properties !== null
      ) {
        const propKeys = new Set(Object.keys(properties));
        for (let i = 0; i < required.length; i++) {
          if (!propKeys.has(required[i])) {
            results.push({
              message: `required field "${required[i]}" is not defined in properties`,
              path: [...basePath, "required", i],
            });
          }
        }
      }

      if (typeof properties === "object" && properties !== null) {
        for (const [key, schema] of Object.entries(properties)) {
          if (typeof schema !== "object" || schema === null) continue;
          const s = schema as Record<string, unknown>;

          if (Array.isArray(s.enum) && s.enum.length === 0) {
            results.push({
              message: `enum for "${key}" must not be empty`,
              path: [...basePath, "properties", key, "enum"],
            });
          }

          if (s.type === "object") {
            checkObj(s as PayloadObj, [...basePath, "properties", key]);
          }

          if (s.items && typeof s.items === "object") {
            const items = s.items as Record<string, unknown>;
            if (items.type === "object") {
              checkObj(items as PayloadObj, [
                ...basePath,
                "properties",
                key,
                "items",
              ]);
            }
          }
        }
      }
    }

    checkObj(targetVal, [...context.path]);
    return results;
  },
);
