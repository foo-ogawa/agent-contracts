import { Command } from "commander";
import { loadConfig, ConfigLoadError, loadBindings } from "../../config/index.js";
import { resolve, substituteVars } from "../../resolver/index.js";
import { validateSchema } from "../../validator/index.js";
import { generateGuardrails } from "../../guardrail-generator/index.js";
import { runGenerateInterfaceCli } from "./generate-interface.js";

export const generateGuardrailsCommand = new Command("generate")
  .description("Generate guardrail runtime artifacts from DSL, policies, and bindings")
  .argument("[type]", "Type of artifacts to generate (guardrails|interface)", "guardrails")
  .option("-c, --config <path>", "Path to agent-contracts.config.yaml")
  .option("--binding <name...>", "Filter to specific software binding(s)")
  .option(
    "-o, --output <path>",
    "Output path for generated team interface (interface type only)",
  )
  .option(
    "--format <format>",
    "Output format for team interface: yaml or json",
    "yaml",
  )
  .option("--dry-run", "Print what would be generated without writing files", false)
  .option("--quiet", "Suppress output on success", false)
  .action(
    async (
      type: string,
      opts: {
        config?: string;
        binding?: string[];
        output?: string;
        format: string;
        dryRun: boolean;
        quiet: boolean;
      },
    ) => {
      if (type !== "guardrails" && type !== "interface") {
        process.stderr.write(`Unknown generate type: ${type}\n`);
        process.exit(1);
      }

      if (type === "interface" && opts.format !== "yaml" && opts.format !== "json") {
        process.stderr.write(`Invalid --format: expected yaml or json, got ${opts.format}\n`);
        process.exit(1);
      }

      try {
        const config = await loadConfig(opts.config);
        if (!config) {
          process.stderr.write(
            "Error: agent-contracts.config.yaml not found. Use --config to specify path.\n",
          );
          process.exit(1);
        }

        // Load and validate DSL
        const resolved = await resolve(config.dsl);
        const data = config.vars
          ? substituteVars(resolved.data, config.vars)
          : resolved.data;
        const schemaResult = validateSchema(data);

        if (!schemaResult.success) {
          process.stderr.write(
            "Schema validation failed. Run 'agent-contracts validate' for details.\n",
          );
          process.exit(1);
        }

        if (type === "interface") {
          runGenerateInterfaceCli({
            dsl: schemaResult.data!,
            output: opts.output,
            dryRun: opts.dryRun,
            format: opts.format as "yaml" | "json",
            quiet: opts.quiet,
          });
          return;
        }

        // Load bindings
        const loadedBindings = await loadBindings(config.bindings);

        // Generate
        const result = await generateGuardrails({
          dsl: schemaResult.data!,
          config,
          loadedBindings,
          filterBindings: opts.binding,
          dryRun: opts.dryRun,
        });

        // Report diagnostics
        const errors = result.diagnostics.filter((d) => d.severity === "error");
        const warnings = result.diagnostics.filter((d) => d.severity === "warning");
        const infos = result.diagnostics.filter((d) => d.severity === "info");

        if (errors.length > 0) {
          process.stderr.write("Errors:\n");
          for (const d of errors) {
            process.stderr.write(`  error [${d.path}] ${d.message}\n`);
          }
        }

        if (warnings.length > 0 && !opts.quiet) {
          process.stderr.write("Warnings:\n");
          for (const d of warnings) {
            process.stderr.write(`  warning [${d.path}] ${d.message}\n`);
          }
        }

        if (infos.length > 0 && !opts.quiet) {
          for (const d of infos) {
            process.stderr.write(`  info [${d.path}] ${d.message}\n`);
          }
        }

        if (errors.length > 0) {
          process.exit(1);
        }

        if (!opts.quiet) {
          const action = opts.dryRun ? "Would generate" : "Generated";
          process.stdout.write(
            `${action} ${result.outputFiles.length} file(s):\n`,
          );
          for (const f of result.outputFiles) {
            process.stdout.write(`  ${f}\n`);
          }
        }
      } catch (err) {
        if (err instanceof ConfigLoadError) {
          process.stderr.write(`Config error: ${err.message}\n`);
          process.exit(1);
        }
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`Error: ${msg}\n`);
        process.exit(1);
      }
    },
  );
