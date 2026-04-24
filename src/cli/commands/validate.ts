import { Command } from "commander";
import { loadConfig, resolveDslPath } from "../../config/index.js";
import { resolve, substituteVars } from "../../resolver/index.js";
import { validateSchema, checkReferences, validateHandoffSchemas } from "../../validator/index.js";
import { formatDiagnostics, type FormatOptions } from "../format.js";
import { getTeamEntries, isMultiTeamConfig } from "../multi-team.js";

const DIR_DEFAULT = "agent-contracts.yaml";

export const validateCommand = new Command("validate")
  .description("Validate DSL against schema and check references")
  .argument("[dir]", "Path to agent-contracts.yaml", DIR_DEFAULT)
  .option("-c, --config <path>", "Path to agent-contracts.config.yaml")
  .option("--team <id>", "Limit to one team (multi-team config only)")
  .option("--format <format>", "Output format (text|json)", "text")
  .option("--quiet", "Suppress output on success", false)
  .option("--strict", "Treat warnings as errors", false)
  .action(
    async (
      dir: string,
      opts: FormatOptions & { config?: string; team?: string; strict: boolean },
    ) => {
    try {
      const config = await loadConfig(opts.config);

      if (config !== null && isMultiTeamConfig(config)) {
        const teamEntries = getTeamEntries(config, opts.team);
        let hasErrors = false;
        let allTeamsFullyClean = true;
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
            const output = formatDiagnostics(schemaResult.diagnostics, opts);
            if (output) process.stderr.write(output + "\n");
            hasErrors = true;
            allTeamsFullyClean = false;
            continue;
          }

          const refDiags = checkReferences(schemaResult.data!);
          const handoffDiags = validateHandoffSchemas(schemaResult.data!);
          const allDiags = [...refDiags, ...handoffDiags, ...schemaWarnings];
          const hasWarnings = allDiags.some(
            (d) => "severity" in d && d.severity === "warning",
          );
          if (allDiags.length > 0) {
            allTeamsFullyClean = false;
            const output = formatDiagnostics(allDiags, opts);
            if (output) process.stderr.write(output + "\n");
            if (
              refDiags.length > 0 ||
              handoffDiags.length > 0 ||
              (opts.strict && hasWarnings)
            ) {
              hasErrors = true;
            }
          }
        }
        if (hasErrors) process.exit(1);
        if (!opts.quiet && allTeamsFullyClean) {
          process.stdout.write("Validation passed.\n");
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
        const output = formatDiagnostics(schemaResult.diagnostics, opts);
        if (output) process.stderr.write(output + "\n");
        process.exit(1);
      }

      const refDiags = checkReferences(schemaResult.data!);
      const handoffDiags = validateHandoffSchemas(schemaResult.data!);
      const allDiags = [...refDiags, ...handoffDiags, ...schemaWarnings];
      const hasWarnings = allDiags.some(
        (d) => "severity" in d && d.severity === "warning",
      );
      if (allDiags.length > 0) {
        const output = formatDiagnostics(allDiags, opts);
        if (output) process.stderr.write(output + "\n");
        if (
          refDiags.length > 0 ||
          handoffDiags.length > 0 ||
          (opts.strict && hasWarnings)
        ) {
          process.exit(1);
        }
      }

      if (!opts.quiet && allDiags.length === 0) {
        process.stdout.write("Validation passed.\n");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`Error: ${msg}\n`);
      process.exit(1);
    }
  },
  );
