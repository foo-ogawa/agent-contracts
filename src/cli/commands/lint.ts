import { Command } from "commander";
import { loadConfig, resolveDslPath } from "../../config/index.js";
import { resolve } from "../../resolver/index.js";
import { validateSchema } from "../../validator/index.js";
import { lint, spectralLint } from "../../linter/index.js";
import { formatDiagnostics, type OutputFormat } from "../format.js";

const DIR_DEFAULT = "agent-contracts.yaml";

export const lintCommand = new Command("lint")
  .description("Run semantic lint rules on resolved DSL")
  .argument("[dir]", "Path to agent-contracts.yaml", DIR_DEFAULT)
  .option("-c, --config <path>", "Path to agent-contracts.config.yaml")
  .option("--format <format>", "Output format (text|json)", "text")
  .option("--quiet", "Suppress output on success", false)
  .option("--strict", "Treat warnings as errors", false)
  .action(
    async (
      dir: string,
      opts: { config?: string; format: OutputFormat; quiet: boolean; strict: boolean },
    ) => {
      try {
        const config = await loadConfig(opts.config);
        const dslPath = resolveDslPath(dir, DIR_DEFAULT, config);
        const resolved = await resolve(dslPath);
        const schemaResult = validateSchema(resolved.data);

        if (!schemaResult.success) {
          const output = formatDiagnostics(schemaResult.diagnostics, {
            format: opts.format,
            quiet: opts.quiet,
          });
          if (output) process.stderr.write(output + "\n");
          process.exit(1);
        }

        const tsDiagnostics = lint(schemaResult.data!);
        const spectralDiagnostics = await spectralLint(schemaResult.data! as unknown as Record<string, unknown>);
        const diagnostics = [...tsDiagnostics, ...spectralDiagnostics];
        if (diagnostics.length > 0) {
          const output = formatDiagnostics(diagnostics, {
            format: opts.format,
            quiet: opts.quiet,
          });
          if (output) process.stderr.write(output + "\n");

          const hasErrors = diagnostics.some((d) => d.severity === "error");
          const hasWarnings = diagnostics.some((d) => d.severity === "warning");

          if (hasErrors || (opts.strict && hasWarnings)) {
            process.exit(1);
          }
        }

        if (!opts.quiet && diagnostics.length === 0) {
          process.stdout.write("Lint passed.\n");
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`Error: ${msg}\n`);
        process.exit(1);
      }
    },
  );
