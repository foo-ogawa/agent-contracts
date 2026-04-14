import { Command } from "commander";
import { loadConfig, resolveDslPath } from "../../config/index.js";
import { resolve } from "../../resolver/index.js";
import { stringify } from "yaml";

const DIR_DEFAULT = "agent-contracts.yaml";

export const resolveCommand = new Command("resolve")
  .description("Resolve DSL (load + merge extends) and output YAML")
  .argument("[dir]", "Path to agent-contracts.yaml", DIR_DEFAULT)
  .option("-c, --config <path>", "Path to agent-contracts.config.yaml")
  .option("--format <format>", "Output format (text|json)", "text")
  .action(async (dir: string, opts: { config?: string; format: string }) => {
    try {
      const config = await loadConfig(opts.config);
      const dslPath = resolveDslPath(dir, DIR_DEFAULT, config);
      const result = await resolve(dslPath);
      if (opts.format === "json") {
        process.stdout.write(JSON.stringify(result.data, null, 2) + "\n");
      } else {
        process.stdout.write(stringify(result.data));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`Error: ${msg}\n`);
      process.exit(1);
    }
  });
