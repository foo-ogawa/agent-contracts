import { Command } from "commander";
import { loadConfig, resolveDslPath } from "../../config/index.js";
import { resolve } from "../../resolver/index.js";
import { validateSchema, checkReferences } from "../../validator/index.js";
import { formatDiagnostics, type FormatOptions } from "../format.js";

const DIR_DEFAULT = "agent-contracts.yaml";

export const validateCommand = new Command("validate")
  .description("Validate DSL against schema and check references")
  .argument("[dir]", "Path to agent-contracts.yaml", DIR_DEFAULT)
  .option("-c, --config <path>", "Path to agent-contracts.config.yaml")
  .option("--format <format>", "Output format (text|json)", "text")
  .option("--quiet", "Suppress output on success", false)
  .action(async (dir: string, opts: FormatOptions & { config?: string }) => {
    try {
      const config = await loadConfig(opts.config);
      const dslPath = resolveDslPath(dir, DIR_DEFAULT, config);
      const resolved = await resolve(dslPath);
      const schemaResult = validateSchema(resolved.data);

      if (!schemaResult.success) {
        const output = formatDiagnostics(schemaResult.diagnostics, opts);
        if (output) process.stderr.write(output + "\n");
        process.exit(1);
      }

      const refDiags = checkReferences(schemaResult.data!);
      if (refDiags.length > 0) {
        const output = formatDiagnostics(refDiags, opts);
        if (output) process.stderr.write(output + "\n");
        process.exit(1);
      }

      if (!opts.quiet) {
        process.stdout.write("Validation passed.\n");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`Error: ${msg}\n`);
      process.exit(1);
    }
  });
