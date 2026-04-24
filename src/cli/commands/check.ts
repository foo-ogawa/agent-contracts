import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Command } from "commander";
import { parse as parseYaml, stringify } from "yaml";
import { loadConfig, loadBindings, ConfigLoadError } from "../../config/index.js";
import { resolve, substituteVars } from "../../resolver/index.js";
import { validateSchema, checkReferences, validateHandoffSchemas } from "../../validator/index.js";
import { lint, spectralLint } from "../../linter/index.js";
import { checkDriftFromConfig, type RenderOptions } from "../../renderer/index.js";
import { formatDiagnostics, type OutputFormat } from "../format.js";
import { generateInterface } from "../../interface-generator/index.js";

export const checkCommand = new Command("check")
  .description("Run full pipeline: resolve → validate → lint → render --check")
  .option("-c, --config <path>", "Path to agent-contracts.config.yaml")
  .option("--format <format>", "Output format (text|json)", "text")
  .option("--quiet", "Suppress output on success", false)
  .option("--strict", "Treat warnings as errors", false)
  .action(
    async (opts: {
      config?: string;
      format: OutputFormat;
      quiet: boolean;
      strict: boolean;
    }) => {
      let hasErrors = false;

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
        const schemaWarnings = schemaResult.diagnostics.filter(
          (d) => d.severity === "warning",
        );
        if (!schemaResult.success) {
          const output = formatDiagnostics(schemaResult.diagnostics, {
            format: opts.format,
            quiet: opts.quiet,
          });
          if (output) process.stderr.write(output + "\n");
          process.exit(1);
        }

        const refDiags = checkReferences(schemaResult.data!);
        const handoffDiags = validateHandoffSchemas(schemaResult.data!);
        const allRefDiags = [...refDiags, ...handoffDiags, ...schemaWarnings];
        if (allRefDiags.length > 0) {
          const output = formatDiagnostics(allRefDiags, {
            format: opts.format,
            quiet: opts.quiet,
          });
          if (output) process.stderr.write(output + "\n");
          hasErrors = true;
        }

        const tsLintDiags = lint(schemaResult.data!);
        const spectralDiags = await spectralLint(schemaResult.data! as unknown as Record<string, unknown>);
        const lintDiags = [...tsLintDiags, ...spectralDiags];
        if (lintDiags.length > 0) {
          const output = formatDiagnostics(lintDiags, {
            format: opts.format,
            quiet: opts.quiet,
          });
          if (output) process.stderr.write(output + "\n");

          if (lintDiags.some((d) => d.severity === "error")) {
            hasErrors = true;
          }
          if (opts.strict && lintDiags.some((d) => d.severity === "warning")) {
            hasErrors = true;
          }
        }

        let renderOptions: RenderOptions | undefined;
        if (config.bindings.length > 0) {
          const loadedBindings = await loadBindings(config.bindings);
          renderOptions = {
            loadedBindings,
            activeGuardrailPolicy: config.activeGuardrailPolicy,
          };
        }

        const drift = await checkDriftFromConfig(
          schemaResult.data!,
          config.renders,
          renderOptions,
        );

        if (drift.hasDrift) {
          process.stderr.write("Drift detected in:\n");
          for (const f of drift.diffs) {
            process.stderr.write(`  ${f}\n`);
          }
          hasErrors = true;
        }

        if (schemaResult.data!.team_interface) {
          const interfacePath = join(config.configDir, "team-interface.yaml");
          if (existsSync(interfacePath)) {
            const result = generateInterface({
              dsl: schemaResult.data!,
              dryRun: true,
              format: "yaml",
            });
            const existing = readFileSync(interfacePath, "utf8");
            const normalize = (raw: string): string => {
              try {
                const parsed = parseYaml(raw) as Record<string, unknown>;
                if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                  const { generated_at: _t, ...rest } = parsed;
                  return `${stringify(rest, { sortMapEntries: true })}\n`;
                }
              } catch {
                /* fall through */
              }
              return raw.trim();
            };
            if (normalize(existing) !== normalize(result.content)) {
              process.stderr.write("Drift detected in team-interface.yaml\n");
              hasErrors = true;
            }
          }
        }

        if (hasErrors) {
          process.exit(1);
        }

        if (!opts.quiet) {
          process.stdout.write("All checks passed.\n");
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
