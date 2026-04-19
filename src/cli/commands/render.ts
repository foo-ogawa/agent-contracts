import { Command } from "commander";
import { loadConfig, loadBindings, ConfigLoadError } from "../../config/index.js";
import { resolve, substituteVars } from "../../resolver/index.js";
import { validateSchema } from "../../validator/index.js";
import { renderFromConfig, checkDriftFromConfig, type RenderOptions } from "../../renderer/index.js";

export const renderCommand = new Command("render")
  .description("Render resolved DSL with Handlebars templates (requires config)")
  .option("-c, --config <path>", "Path to agent-contracts.config.yaml")
  .option("--check", "Check for drift without writing files", false)
  .option("--quiet", "Suppress output on success", false)
  .action(
    async (opts: { config?: string; check: boolean; quiet: boolean }) => {
      try {
        const config = await loadConfig(opts.config);
        if (!config) {
          process.stderr.write(
            "Error: agent-contracts.config.yaml not found. Use --config to specify path.\n",
          );
          process.exit(1);
        }

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

        let renderOptions: RenderOptions | undefined;
        if (config.bindings.length > 0) {
          const loadedBindings = await loadBindings(config.bindings);
          renderOptions = {
            loadedBindings,
            activeGuardrailPolicy: config.activeGuardrailPolicy,
          };
        }

        if (opts.check) {
          const drift = await checkDriftFromConfig(
            schemaResult.data!,
            config.renders,
            renderOptions,
          );

          if (drift.hasDrift) {
            process.stderr.write("Drift detected in the following files:\n");
            for (const f of drift.diffs) {
              process.stderr.write(`  ${f}\n`);
            }
            process.exit(1);
          }

          if (!opts.quiet) {
            process.stdout.write("No drift detected.\n");
          }
        } else {
          const files = await renderFromConfig(
            schemaResult.data!,
            config.renders,
            renderOptions,
          );

          if (!opts.quiet) {
            process.stdout.write(`Rendered ${files.length} file(s):\n`);
            for (const f of files) {
              process.stdout.write(`  ${f}\n`);
            }
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
