import { mergeEntityMaps, deepMergeEntities } from "../resolver/index.js";

type AnyRecord = Record<string, unknown>;

function isRecord(v: unknown): v is AnyRecord {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const BINDING_MAP_MERGE_SECTIONS = ["guardrail_impl", "outputs"];
const BINDING_ARRAY_MERGE_SECTIONS = ["renders"];

export function mergeBinding(
  base: AnyRecord,
  project: AnyRecord,
): AnyRecord {
  const hasExtends = typeof project["extends"] === "string";
  const result: AnyRecord = { ...base, ...project };

  for (const section of BINDING_MAP_MERGE_SECTIONS) {
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

  for (const section of BINDING_ARRAY_MERGE_SECTIONS) {
    const baseVal = base[section];
    const projVal = project[section];

    if (projVal === undefined) continue;

    const baseArr = Array.isArray(baseVal) ? baseVal : [];
    const projArr = Array.isArray(projVal) ? projVal : [];
    result[section] = [...baseArr, ...projArr];
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
