import type { Dsl } from "../../schema/index.js";
import type { LintRule, LintDiagnostic } from "../types.js";

export const toolCommandsRule: LintRule = {
  id: "tool-commands",
  description:
    "Validate tool commands: reads/writes reference existing artifacts; writes align with output_artifacts",

  run(dsl: Dsl): LintDiagnostic[] {
    const diagnostics: LintDiagnostic[] = [];

    for (const [toolId, tool] of Object.entries(dsl.tools)) {
      for (const cmd of tool.commands) {
        for (const ref of cmd.reads) {
          if (!dsl.artifacts[ref]) {
            diagnostics.push({
              ruleId: "tool-commands",
              severity: "error",
              path: `tools.${toolId}.commands`,
              message: `Command "${cmd.command}" reads artifact "${ref}" which does not exist`,
            });
          }
        }

        for (const ref of cmd.writes) {
          if (!dsl.artifacts[ref]) {
            diagnostics.push({
              ruleId: "tool-commands",
              severity: "error",
              path: `tools.${toolId}.commands`,
              message: `Command "${cmd.command}" writes artifact "${ref}" which does not exist`,
            });
          }
          if (dsl.artifacts[ref] && !tool.output_artifacts.includes(ref)) {
            diagnostics.push({
              ruleId: "tool-commands",
              severity: "warning",
              path: `tools.${toolId}.commands`,
              message: `Command "${cmd.command}" writes artifact "${ref}" but tool's output_artifacts does not include it`,
            });
          }
        }
      }
    }

    return diagnostics;
  },
};
