import { mergeEntityMaps, deepMergeEntities } from "../resolver/index.js";

type AnyRecord = Record<string, unknown>;

function isRecord(v: unknown): v is AnyRecord {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const BINDING_MERGE_SECTIONS = ["guardrail_impl", "outputs"];

export function mergeBinding(
  base: AnyRecord,
  project: AnyRecord,
): AnyRecord {
  const hasExtends = typeof project["extends"] === "string";
  const result: AnyRecord = { ...base, ...project };

  for (const section of BINDING_MERGE_SECTIONS) {
    const baseVal = base[section];
    const projVal = project[section];

    if (projVal === undefined) {
      continue;
    }

    const baseMap = isRecord(baseVal) ? baseVal : {};
    result[section] = mergeEntityMaps(
      baseMap,
      projVal as AnyRecord,
      section,
      hasExtends,
    );
  }

  // reporting: deep merge when both sides are objects, otherwise project wins
  if (
    project["reporting"] !== undefined &&
    isRecord(base["reporting"]) &&
    isRecord(project["reporting"])
  ) {
    result["reporting"] = deepMergeEntities(
      base["reporting"] as AnyRecord,
      project["reporting"] as AnyRecord,
      "reporting",
      hasExtends,
    );
  }

  delete result["extends"];
  return result;
}
