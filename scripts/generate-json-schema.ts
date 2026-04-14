import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { DslSchema } from "../src/schema/dsl.js";

const rootDir = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const outPath = join(rootDir, "schemas", "dsl.schema.json");

const jsonSchema = z.toJSONSchema(DslSchema, {
  unrepresentable: "any",
  target: "draft-2020-12",
});

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(jsonSchema, null, 2), "utf8");
console.log("Generated", outPath);
