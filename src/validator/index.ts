export {
  validateSchema,
  type SchemaValidationResult,
  type DiagnosticMessage,
} from "./schema-validator.js";
export {
  checkReferences,
  type ReferenceDiagnostic,
} from "./reference-resolver.js";
export { validateHandoffSchemas } from "./handoff-schema-validator.js";
