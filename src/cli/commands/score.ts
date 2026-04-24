import { Command } from "commander";
import { loadConfig, resolveDslPath } from "../../config/index.js";
import { resolve, substituteVars } from "../../resolver/index.js";
import { validateSchema } from "../../validator/index.js";
import { score } from "../../scorer/index.js";
import type { ScoreResult } from "../../scorer/index.js";
import type { OutputFormat } from "../format.js";
import { getTeamEntries, isMultiTeamConfig } from "../multi-team.js";

const DIR_DEFAULT = "agent-contracts.yaml";

function formatText(result: ScoreResult): string {
  const lines: string[] = [];
  lines.push(`DSL Completeness Score: ${result.overall}/100`);
  lines.push("");

  for (const d of result.dimensions) {
    const detail =
      d.total > 0 ? ` (${d.score}/${d.total} ${d.id.split("-")[0]})` : "";
    lines.push(
      `  ${d.label.padEnd(40)} ${String(d.percent).padStart(3)}%${detail}`,
    );
  }

  const allRecs = result.dimensions.flatMap((d) => d.recommendations);
  if (allRecs.length > 0) {
    lines.push("");
    lines.push("Recommendations:");
    for (const rec of allRecs) {
      lines.push(`  - ${rec}`);
    }
  }

  return lines.join("\n");
}

export const scoreCommand = new Command("score")
  .description("Calculate DSL completeness score")
  .argument("[dir]", "Path to agent-contracts.yaml", DIR_DEFAULT)
  .option("-c, --config <path>", "Path to agent-contracts.config.yaml")
  .option("--team <id>", "Limit to one team (multi-team config only)")
  .option("--format <format>", "Output format (text|json)", "text")
  .option("--threshold <number>", "Minimum score (exit 1 if below)", undefined)
  .action(
    async (
      dir: string,
      opts: {
        config?: string;
        team?: string;
        format: OutputFormat;
        threshold?: string;
      },
    ) => {
      try {
        const config = await loadConfig(opts.config);

        if (config !== null && isMultiTeamConfig(config)) {
          const teamEntries = getTeamEntries(config, opts.team);
          let thresholdNum: number | undefined;
          if (opts.threshold !== undefined) {
            thresholdNum = parseInt(opts.threshold, 10);
            if (isNaN(thresholdNum)) {
              process.stderr.write(
                `Error: --threshold must be a number, got "${opts.threshold}"\n`,
              );
              process.exit(1);
            }
          }

          let hasErrors = false;
          for (const [teamId, teamConfig] of teamEntries) {
            process.stdout.write(`\n--- Team: ${teamId} ---\n`);
            const resolved = await resolve(teamConfig.dsl);
            const data = teamConfig.vars
              ? substituteVars(resolved.data, teamConfig.vars)
              : resolved.data;
            const schemaResult = validateSchema(data);

            if (!schemaResult.success) {
              const issues = schemaResult.diagnostics
                .map((d) => `  ${d.path}: ${d.message}`)
                .join("\n");
              process.stderr.write(`Schema validation failed:\n${issues}\n`);
              hasErrors = true;
              continue;
            }

            const result = score(schemaResult.data!);

            if (opts.format === "json") {
              process.stdout.write(JSON.stringify(result, null, 2) + "\n");
            } else {
              process.stdout.write(formatText(result) + "\n");
            }

            if (thresholdNum !== undefined && result.overall < thresholdNum) {
              process.stderr.write(
                `Score ${result.overall} is below threshold ${thresholdNum}\n`,
              );
              hasErrors = true;
            }
          }
          if (hasErrors) process.exit(1);
          return;
        }

        const dslPath = resolveDslPath(dir, DIR_DEFAULT, config);
        const resolved = await resolve(dslPath);
        const data = config?.vars
          ? substituteVars(resolved.data, config.vars)
          : resolved.data;
        const schemaResult = validateSchema(data);

        if (!schemaResult.success) {
          const issues = schemaResult.diagnostics
            .map((d) => `  ${d.path}: ${d.message}`)
            .join("\n");
          process.stderr.write(`Schema validation failed:\n${issues}\n`);
          process.exit(1);
        }

        const result = score(schemaResult.data!);

        if (opts.format === "json") {
          process.stdout.write(JSON.stringify(result, null, 2) + "\n");
        } else {
          process.stdout.write(formatText(result) + "\n");
        }

        if (opts.threshold !== undefined) {
          const threshold = parseInt(opts.threshold, 10);
          if (isNaN(threshold)) {
            process.stderr.write(
              `Error: --threshold must be a number, got "${opts.threshold}"\n`,
            );
            process.exit(1);
          }
          if (result.overall < threshold) {
            process.stderr.write(
              `Score ${result.overall} is below threshold ${threshold}\n`,
            );
            process.exit(1);
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`Error: ${msg}\n`);
        process.exit(1);
      }
    },
  );
