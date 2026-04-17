#!/usr/bin/env node
import { Command } from "commander";
import { resolveCommand } from "./commands/resolve.js";
import { validateCommand } from "./commands/validate.js";
import { lintCommand } from "./commands/lint.js";
import { renderCommand } from "./commands/render.js";
import { checkCommand } from "./commands/check.js";
import { generateGuardrailsCommand } from "./commands/generate-guardrails.js";

const program = new Command();

program
  .name("agent-contracts")
  .description("Agent contracts tooling — validate, lint, render DSL files")
  .version("0.0.2");

program.addCommand(resolveCommand);
program.addCommand(validateCommand);
program.addCommand(lintCommand);
program.addCommand(renderCommand);
program.addCommand(checkCommand);
program.addCommand(generateGuardrailsCommand);

program.parse();
