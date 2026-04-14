import { createRulesetFunction } from "@stoplight/spectral-core";

type WorkflowStep = {
  type: string;
  handoff_kind?: string;
  task?: string;
  from_agent?: string;
  validation?: string;
};

type WorkflowPhase = {
  steps: WorkflowStep[];
};

/**
 * Section 15.2.5: workflow handoff step's handoff_kind must exist in handoff_types.
 * Also checks from_agent → agents and task → tasks.
 */
export default createRulesetFunction<WorkflowPhase, null>(
  { input: { type: "object" }, options: null },
  (targetVal, _options, context) => {
    const root = context.document.data as Record<string, unknown>;
    const handoffTypes = root.handoff_types as Record<string, unknown> | undefined;
    const agents = root.agents as Record<string, unknown> | undefined;
    const tasks = root.tasks as Record<string, unknown> | undefined;
    const validations = root.validations as Record<string, unknown> | undefined;

    const handoffKeys = handoffTypes ? new Set(Object.keys(handoffTypes)) : new Set<string>();
    const agentKeys = agents ? new Set(Object.keys(agents)) : new Set<string>();
    const taskKeys = tasks ? new Set(Object.keys(tasks)) : new Set<string>();
    const validationKeys = validations ? new Set(Object.keys(validations)) : new Set<string>();

    const results: { message: string; path: (string | number)[] }[] = [];
    const steps = targetVal.steps ?? [];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const stepPath = [...context.path, "steps", i];

      if (step.type === "handoff") {
        if (step.handoff_kind && !handoffKeys.has(step.handoff_kind)) {
          results.push({
            message: `handoff_kind "${step.handoff_kind}" does not exist in handoff_types`,
            path: [...stepPath, "handoff_kind"],
          });
        }
        if (step.from_agent && !agentKeys.has(step.from_agent)) {
          results.push({
            message: `from_agent "${step.from_agent}" does not exist in agents`,
            path: [...stepPath, "from_agent"],
          });
        }
        if (step.task && !taskKeys.has(step.task)) {
          results.push({
            message: `task "${step.task}" does not exist in tasks`,
            path: [...stepPath, "task"],
          });
        }
      }

      if (step.type === "validation") {
        if (step.validation && !validationKeys.has(step.validation)) {
          results.push({
            message: `validation "${step.validation}" does not exist in validations`,
            path: [...stepPath, "validation"],
          });
        }
      }
    }

    return results;
  },
);
