import { readFile, writeFile, mkdir, chmod, unlink } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import Handlebars from "handlebars";
import type { Dsl } from "../schema/index.js";
import type { ResolvedConfig } from "../config/types.js";
import type { LoadedBinding } from "../config/binding-loader.js";
import type {
  GuardrailGenerationContext,
  GenerateResult,
  GenerateDiagnostic,
} from "./types.js";
import { resolveChecks } from "./resolve-checks.js";
import { resolveBindingTargetPath } from "./resolve-paths.js";

// Register the `json` template helper
Handlebars.registerHelper("json", (value: unknown) => {
  return new Handlebars.SafeString(JSON.stringify(value, null, 2));
});

// Register the `expand` template helper for reporting command placeholder expansion
Handlebars.registerHelper(
  "expand",
  (pattern: string, options: Handlebars.HelperOptions) => {
    if (typeof pattern !== "string") return "";
    const hash = options.hash as Record<string, string>;
    let result = pattern;
    for (const [key, val] of Object.entries(hash)) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), String(val));
    }
    return new Handlebars.SafeString(result);
  },
);

export interface GenerateGuardrailsOptions {
  dsl: Dsl;
  config: ResolvedConfig;
  loadedBindings: LoadedBinding[];
  filterBindings?: string[];
  dryRun?: boolean;
}

export async function generateGuardrails(
  options: GenerateGuardrailsOptions,
): Promise<GenerateResult> {
  const { dsl, config, loadedBindings, filterBindings, dryRun } = options;
  const outputFiles: string[] = [];
  const diagnostics: GenerateDiagnostic[] = [];

  // Select active policy
  const policyName = config.activeGuardrailPolicy;
  if (!policyName) {
    diagnostics.push({
      path: "config.active_guardrail_policy",
      message:
        "No active_guardrail_policy specified in config — no guardrails will be generated",
      severity: "warning",
    });
    return { outputFiles, diagnostics };
  }

  const policy = dsl.guardrail_policies[policyName];
  if (!policy) {
    diagnostics.push({
      path: "config.active_guardrail_policy",
      message: `Active guardrail policy "${policyName}" not found in DSL guardrail_policies`,
      severity: "error",
    });
    return { outputFiles, diagnostics };
  }

  // Build all_bindings map
  const allBindings: Record<string, LoadedBinding["binding"]> = {};
  for (const lb of loadedBindings) {
    allBindings[lb.binding.software] = lb.binding;
  }

  // Find reporting binding (one with `reporting` section)
  let reporting: GuardrailGenerationContext["reporting"] = null;
  for (const lb of loadedBindings) {
    if (lb.binding.reporting) {
      reporting = {
        commands: lb.binding.reporting.commands,
        fail_open: lb.binding.reporting.fail_open,
        timeout_ms: lb.binding.reporting.timeout_ms,
      };
      break;
    }
  }

  const paths = config.paths ?? {};
  const vars = config.vars ?? {};

  // Process each binding
  for (const lb of loadedBindings) {
    const binding = lb.binding;

    if (filterBindings && !filterBindings.includes(binding.software)) {
      continue;
    }

    if (!binding.outputs) continue;

    // Resolve checks for this binding
    const checkResult = resolveChecks(dsl, binding, policy);
    diagnostics.push(...checkResult.diagnostics);

    // Build generation context
    const ctx: GuardrailGenerationContext = {
      system: { id: dsl.system.id, name: dsl.system.name },
      guardrails: dsl.guardrails,
      policy,
      binding,
      all_bindings: allBindings,
      vars,
      paths,
      reporting,
      resolved_checks: checkResult.resolved,
    };

    // Process each output
    for (const [outputId, outputDef] of Object.entries(binding.outputs)) {
      // Resolve target path
      const pathResult = resolveBindingTargetPath(
        outputDef.target,
        paths,
        binding.software,
      );
      diagnostics.push(...pathResult.diagnostics);

      if (pathResult.diagnostics.some((d) => d.severity === "error")) {
        continue;
      }

      const targetPath = resolve(config.configDir, pathResult.resolved);

      // Get template content
      let templateContent: string;
      if (outputDef.inline_template) {
        templateContent = outputDef.inline_template;
      } else if (outputDef.template) {
        if (outputDef.template.startsWith("builtin:")) {
          // Builtin templates are not yet implemented — skip with info
          diagnostics.push({
            path: `binding.${binding.software}.outputs.${outputId}`,
            message: `Builtin template "${outputDef.template}" is not yet implemented — skipping`,
            severity: "info",
          });
          continue;
        }
        const templatePath = resolve(config.configDir, outputDef.template);
        try {
          templateContent = await readFile(templatePath, "utf8");
        } catch {
          diagnostics.push({
            path: `binding.${binding.software}.outputs.${outputId}`,
            message: `Template file not found: ${templatePath}`,
            severity: "error",
          });
          continue;
        }
      } else {
        diagnostics.push({
          path: `binding.${binding.software}.outputs.${outputId}`,
          message: "Output has neither template nor inline_template",
          severity: "error",
        });
        continue;
      }

      const shouldSkipEmpty = outputDef.skip_empty === true;

      // If group_by is set, render once per group
      if (outputDef.group_by) {
        const groupField = outputDef.group_by;
        const groups = new Map<string, typeof checkResult.resolved>();

        for (const rc of checkResult.resolved) {
          const key = String(
            (rc.check as Record<string, unknown>)[groupField] ?? "default",
          );
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(rc);
        }

        for (const [groupKey, groupChecks] of groups) {
          const groupCtx = {
            ...ctx,
            resolved_checks: groupChecks,
            current_group: groupKey,
          };
          const compiled = Handlebars.compile(templateContent, { noEscape: true });
          const output = compiled(groupCtx);

          const groupTarget = resolve(targetPath, groupKey);

          if (shouldSkipEmpty && output.trim().length === 0) {
            if (!dryRun) {
              try { await unlink(groupTarget); } catch { /* not found */ }
            }
            continue;
          }

          if (!dryRun) {
            await mkdir(dirname(groupTarget), { recursive: true });
            await writeFile(groupTarget, output, "utf8");
            if (outputDef.executable) {
              await chmod(groupTarget, 0o755);
            }
          }
          outputFiles.push(groupTarget);
        }
      } else {
        const compiled = Handlebars.compile(templateContent, { noEscape: true });
        const output = compiled(ctx);

        if (shouldSkipEmpty && output.trim().length === 0) {
          if (!dryRun) {
            try { await unlink(targetPath); } catch { /* not found */ }
          }
        } else {
          if (!dryRun) {
            await mkdir(dirname(targetPath), { recursive: true });
            await writeFile(targetPath, output, "utf8");
            if (outputDef.executable) {
              await chmod(targetPath, 0o755);
            }
          }
          outputFiles.push(targetPath);
        }
      }
    }
  }

  return { outputFiles, diagnostics };
}
