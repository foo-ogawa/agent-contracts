import { Command } from "commander";
import { loadConfig, resolveDslPath } from "../../config/index.js";
import { resolve, substituteVars } from "../../resolver/index.js";
import { expandDefaults } from "../../resolver/expand-defaults.js";
import { stringify } from "yaml";
import { getTeamEntries, isMultiTeamConfig } from "../multi-team.js";

const DIR_DEFAULT = "agent-contracts.yaml";

export const resolveCommand = new Command("resolve")
  .description("Resolve DSL (load + merge extends) and output YAML")
  .argument("[dir]", "Path to agent-contracts.yaml", DIR_DEFAULT)
  .option("-c, --config <path>", "Path to agent-contracts.config.yaml")
  .option("--team <id>", "Limit to one team (multi-team config only)")
  .option("--format <format>", "Output format (text|json)", "text")
  .option("--expand-defaults", "Expand all Zod default values in output", false)
  .action(
    async (
      dir: string,
      opts: { config?: string; team?: string; format: string; expandDefaults: boolean },
    ) => {
    try {
      const config = await loadConfig(opts.config);

      if (config !== null && isMultiTeamConfig(config)) {
        const teamEntries = getTeamEntries(config, opts.team);
        if (opts.format === "json") {
          const out: Record<string, unknown> = {};
          for (const [teamId, teamConfig] of teamEntries) {
            const result = await resolve(teamConfig.dsl);
            let data = teamConfig.vars
              ? substituteVars(result.data, teamConfig.vars)
              : result.data;
            if (opts.expandDefaults) {
              data = expandDefaults(data);
            }
            out[teamId] = data;
          }
          process.stdout.write(JSON.stringify(out, null, 2) + "\n");
        } else {
          for (const [teamId, teamConfig] of teamEntries) {
            process.stdout.write(`\n--- Team: ${teamId} ---\n`);
            const result = await resolve(teamConfig.dsl);
            let data = teamConfig.vars
              ? substituteVars(result.data, teamConfig.vars)
              : result.data;
            if (opts.expandDefaults) {
              data = expandDefaults(data);
            }
            process.stdout.write(stringify(data));
          }
        }
        return;
      }

      const dslPath = resolveDslPath(dir, DIR_DEFAULT, config);
      const result = await resolve(dslPath);
      let data = config?.vars
        ? substituteVars(result.data, config.vars)
        : result.data;
      if (opts.expandDefaults) {
        data = expandDefaults(data);
      }
      if (opts.format === "json") {
        process.stdout.write(JSON.stringify(data, null, 2) + "\n");
      } else {
        process.stdout.write(stringify(data));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`Error: ${msg}\n`);
      process.exit(1);
    }
  },
  );
