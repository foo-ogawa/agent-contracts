import type { Dsl } from "../../schema/index.js";
import type { LintRule, LintDiagnostic } from "../types.js";

export const entityGuardrailUndefinedRule: LintRule = {
  id: "entity-guardrail-undefined",
  description:
    "Entity references a guardrail ID not defined in guardrails",

  run(dsl: Dsl): LintDiagnostic[] {
    const diagnostics: LintDiagnostic[] = [];
    const guardrailIds = new Set(Object.keys(dsl.guardrails));

    const sections: Array<{ name: string; entities: Record<string, { guardrails?: string[] }> }> = [
      { name: "agents", entities: dsl.agents },
      { name: "tasks", entities: dsl.tasks },
      { name: "tools", entities: dsl.tools },
      { name: "artifacts", entities: dsl.artifacts },
    ];

    for (const { name, entities } of sections) {
      for (const [entityId, entity] of Object.entries(entities)) {
        for (const ref of entity.guardrails ?? []) {
          if (!guardrailIds.has(ref)) {
            diagnostics.push({
              ruleId: "entity-guardrail-undefined",
              severity: "error",
              path: `${name}.${entityId}.guardrails`,
              message: `${name.slice(0, -1)} "${entityId}" references guardrail "${ref}" which is not defined in guardrails`,
            });
          }
        }
      }
    }

    return diagnostics;
  },
};

export const entityNoGuardrailsRule: LintRule = {
  id: "entity-no-guardrails",
  description:
    "Entity has no effective guardrails (neither entity-side nor scope-side)",

  run(dsl: Dsl): LintDiagnostic[] {
    const diagnostics: LintDiagnostic[] = [];

    const scopeBindings: Record<string, Set<string>> = {
      agents: new Set<string>(),
      tasks: new Set<string>(),
      tools: new Set<string>(),
      artifacts: new Set<string>(),
    };
    for (const guardrail of Object.values(dsl.guardrails)) {
      for (const key of Object.keys(scopeBindings)) {
        const ids = guardrail.scope[key as keyof typeof guardrail.scope] as string[] | undefined;
        if (ids) {
          for (const id of ids) scopeBindings[key].add(id);
        }
      }
    }

    const sections: Array<{ name: string; entities: Record<string, { guardrails?: string[] }> }> = [
      { name: "agents", entities: dsl.agents },
      { name: "tasks", entities: dsl.tasks },
      { name: "tools", entities: dsl.tools },
      { name: "artifacts", entities: dsl.artifacts },
    ];

    for (const { name, entities } of sections) {
      for (const [entityId, entity] of Object.entries(entities)) {
        const hasEntitySide = (entity.guardrails ?? []).length > 0;
        const hasScopeSide = scopeBindings[name].has(entityId);
        if (!hasEntitySide && !hasScopeSide) {
          diagnostics.push({
            ruleId: "entity-no-guardrails",
            severity: "info",
            path: `${name}.${entityId}`,
            message: `${name.slice(0, -1)} "${entityId}" has no effective guardrails`,
          });
        }
      }
    }

    return diagnostics;
  },
};

export const guardrailOrphanedRule: LintRule = {
  id: "guardrail-orphaned",
  description:
    "Guardrail is not referenced by any entity and not bound to any entity via scope",

  run(dsl: Dsl): LintDiagnostic[] {
    const diagnostics: LintDiagnostic[] = [];

    const referencedByEntities = new Set<string>();
    const sections: Array<Record<string, { guardrails?: string[] }>> = [
      dsl.agents,
      dsl.tasks,
      dsl.tools,
      dsl.artifacts,
    ];
    for (const entities of sections) {
      for (const entity of Object.values(entities)) {
        for (const ref of entity.guardrails ?? []) {
          referencedByEntities.add(ref);
        }
      }
    }

    for (const [guardrailId, guardrail] of Object.entries(dsl.guardrails)) {
      const hasEntityRef = referencedByEntities.has(guardrailId);

      const scope = guardrail.scope;
      const hasScopeBinding =
        (scope.agents?.length ?? 0) > 0 ||
        (scope.tasks?.length ?? 0) > 0 ||
        (scope.tools?.length ?? 0) > 0 ||
        (scope.artifacts?.length ?? 0) > 0 ||
        (scope.workflows?.length ?? 0) > 0;

      if (!hasEntityRef && !hasScopeBinding) {
        diagnostics.push({
          ruleId: "guardrail-orphaned",
          severity: "warning",
          path: `guardrails.${guardrailId}`,
          message: `Guardrail "${guardrailId}" is not referenced by any entity and has no scope bindings`,
        });
      }
    }

    return diagnostics;
  },
};
