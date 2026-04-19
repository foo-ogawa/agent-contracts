import { Command } from "commander";
import { loadConfig, resolveDslPath } from "../../config/index.js";
import { resolve, substituteVars } from "../../resolver/index.js";
import { expandDefaults } from "../../resolver/expand-defaults.js";
import { stringify } from "yaml";

const DIR_DEFAULT = "agent-contracts.yaml";

export const resolveCommand = new Command("resolve")
  .description("Resolve DSL (load + merge extends) and output YAML")
  .argument("[dir]", "Path to agent-contracts.yaml", DIR_DEFAULT)
  .option("-c, --config <path>", "Path to agent-contracts.config.yaml")
  .option("--format <format>", "Output format (text|json)", "text")
  .option("--expand-defaults", "Expand all Zod default values in output", false)
  .action(async (dir: string, opts: { config?: string; format: string; expandDefaults: boolean }) => {
    try {
      const config = await loadConfig(opts.config);
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
  });
