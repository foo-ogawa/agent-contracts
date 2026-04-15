type AnyRecord = Record<string, unknown>;

/**
 * Shallow-merge an array of JSON Schema subschemas from an `allOf`.
 * Merges `properties`, `required`, and top-level scalars (`type`, `description`, etc.).
 * Handles one level of nesting only (sufficient for handoff schema composition).
 */
export function resolveAllOf(
  schema: AnyRecord,
): AnyRecord {
  const allOf = schema["allOf"];
  if (!Array.isArray(allOf)) return schema;

  let mergedProperties: AnyRecord = {};
  let mergedRequired: string[] = [];
  const mergedTop: AnyRecord = {};

  for (const sub of allOf) {
    if (typeof sub !== "object" || sub === null || Array.isArray(sub)) continue;
    const subSchema = sub as AnyRecord;

    if (
      subSchema["properties"] &&
      typeof subSchema["properties"] === "object"
    ) {
      mergedProperties = {
        ...mergedProperties,
        ...(subSchema["properties"] as AnyRecord),
      };
    }

    if (Array.isArray(subSchema["required"])) {
      mergedRequired = [
        ...mergedRequired,
        ...(subSchema["required"] as string[]),
      ];
    }

    for (const [key, value] of Object.entries(subSchema)) {
      if (key !== "properties" && key !== "required" && key !== "allOf") {
        mergedTop[key] = value;
      }
    }
  }

  for (const [key, value] of Object.entries(schema)) {
    if (key === "allOf") continue;
    if (key === "properties" && typeof value === "object") {
      mergedProperties = { ...mergedProperties, ...(value as AnyRecord) };
    } else if (key === "required" && Array.isArray(value)) {
      mergedRequired = [...mergedRequired, ...(value as string[])];
    } else {
      mergedTop[key] = value;
    }
  }

  const result: AnyRecord = { ...mergedTop };
  if (Object.keys(mergedProperties).length > 0) {
    result["properties"] = mergedProperties;
  }
  if (mergedRequired.length > 0) {
    result["required"] = [...new Set(mergedRequired)];
  }
  return result;
}
