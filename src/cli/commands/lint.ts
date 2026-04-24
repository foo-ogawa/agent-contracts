import { Command } from "commander";
import { loadConfig, resolveDslPath } from "../../config/index.js";
import { resolve, substituteVars } from "../../resolver/index.js";
import { validateSchema } from "../../validator/index.js";
import { lint, spectralLint } from "../../linter/index.js";
import { formatDiagnostics, type OutputFormat } from "../format.js";
import { getTeamEntries, isMultiTeamConfig } from "../multi-team.js";

const DIR_DEFAULT = "agent-contracts.yaml";

export const lintCommand = new Command("lint")
  .description("Run semantic lint rules on resolved DSL")
  .argument("[dir]", "Path to agent-contracts.yaml", DIR_DEFAULT)
  .option("-c, --config <path>", "Path to agent-contracts.config.yaml")
  .option("--team <id>", "Limit to one team (multi-team config only)")
  .option("--format <format>", "Output format (text|json)", "text")
  .option("--quiet", "Suppress output on success", false)
  .option("--strict", "Treat warnings as errors", false)
  .action(
    async (
      dir: string,
      opts: {
        config?: string;
        team?: string;
        format: OutputFormat;
        quiet: boolean;
        strict: boolean;
      },
    ) => {
      try {
        const config = await loadConfig(opts.config);

        if (config !== null && isMultiTeamConfig(config)) {
          const teamEntries = getTeamEntries(config, opts.team);
          let hasErrors = false;
          let allClean = true;
          for (const [teamId, teamConfig] of teamEntries) {
            if (!opts.quiet) process.stdout.write(`\n--- Team: ${teamId} ---\n`);
            const resolved = await resolve(teamConfig.dsl);
            const data = teamConfig.vars
              ? substituteVars(resolved.data, teamConfig.vars)
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
              hasErrors = true;
              allClean = false;
              continue;
            }

            const tsDiagnostics = lint(schemaResult.data!);
            const spectralDiagnostics = await spectralLint(
              schemaResult.data! as unknown as Record<string, unknown>,
            );
            const diagnostics = [
              ...tsDiagnostics,
              ...spectralDiagnostics,
              ...schemaWarnings,
            ];
            if (diagnostics.length > 0) {
              allClean = false;
              const output = formatDiagnostics(diagnostics, {
                format: opts.format,
                quiet: opts.quiet,
              });
              if (output) process.stderr.write(output + "\n");

              const teamHasErrors = diagnostics.some((d) => d.severity === "error");
              const teamHasWarnings = diagnostics.some((d) => d.severity === "warning");

              if (teamHasErrors || (opts.strict && teamHasWarnings)) {
                hasErrors = true;
              }
            }
          }

          if (hasErrors) process.exit(1);
          if (!opts.quiet && allClean) {
            process.stdout.write("Lint passed.\n");
          }
          return;
        }

        const dslPath = resolveDslPath(dir, DIR_DEFAULT, config);
        const resolved = await resolve(dslPath);
        const data = config?.vars
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

        const tsDiagnostics = lint(schemaResult.data!);
        const spectralDiagnostics = await spectralLint(schemaResult.data! as unknown as Record<string, unknown>);
        const diagnostics = [...tsDiagnostics, ...spectralDiagnostics, ...schemaWarnings];
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
