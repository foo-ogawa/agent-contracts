import type {
  Dsl,
  Agent,
  Task,
  Artifact,
  Tool,
  Validation,
  HandoffType,
  Workflow,
  Policy,
  System,
} from "../schema/index.js";

export interface GlobalContext {
  system: Dsl["system"];
  agents: Dsl["agents"];
  tasks: Dsl["tasks"];
  artifacts: Dsl["artifacts"];
  tools: Dsl["tools"];
  validations: Dsl["validations"];
  handoff_types: Dsl["handoff_types"];
  workflow: Dsl["workflow"];
  policies: Dsl["policies"];
  [key: string]: unknown;
}

export interface SystemContext {
  system: System;
  dsl: Dsl;
  [key: string]: unknown;
}

export interface PerTaskContext {
  task: Task & { id: string };
  targetAgent: (Agent & { id: string }) | null;
  dsl: Dsl;
  [key: string]: unknown;
}

export interface PerArtifactContext {
  artifact: Artifact & { id: string };
  dsl: Dsl;
  [key: string]: unknown;
}

export interface PerToolContext {
  tool: Tool & { id: string };
  dsl: Dsl;
  [key: string]: unknown;
}

export interface PerValidationContext {
  validation: Validation & { id: string };
  dsl: Dsl;
  [key: string]: unknown;
}

export interface PerHandoffTypeContext {
  handoff_type: HandoffType & { id: string };
  relatedTasks: Array<Task & { id: string }>;
  dsl: Dsl;
  [key: string]: unknown;
}

export interface PerWorkflowContext {
  workflow: Workflow & { id: string };
  dsl: Dsl;
  [key: string]: unknown;
}

export interface PerPolicyContext {
  policy: Policy & { id: string };
  dsl: Dsl;
  [key: string]: unknown;
}

export interface MergedBehavioralSpec {
  responsibilities: string[];
  constraints: string[];
  rules: Array<Record<string, unknown>>;
  anti_patterns: string[];
  escalation_criteria: Array<Record<string, unknown>>;
  execution_steps: Array<Record<string, unknown>>;
  completion_criteria: string[];
}

export interface DelegatableTaskView {
  id: string;
  description: string;
  target_agent: string;
  workflow: string;
  input_artifacts: string[];
  invocation_handoff: string;
  invocation_payload_keys: string[];
  result_handoff: string;
  result_payload_keys: string[];
}

export interface PerAgentContext {
  agent: (Agent & Record<string, unknown>) & { id: string };
  tasks: Array<(Task & Record<string, unknown>) & { id: string }>;
  receivableTasks: Array<(Task & Record<string, unknown>) & { id: string }>;
  delegatableTasks: DelegatableTaskView[];
  relatedArtifacts: Dsl["artifacts"];
  relatedTools: Dsl["tools"];
  relatedHandoffTypes: Dsl["handoff_types"];
  mergedBehavior: MergedBehavioralSpec;
  dsl: Dsl;
  [key: string]: unknown;
}

export function buildGlobalContext(dsl: Dsl): GlobalContext {
  return {
    system: dsl.system,
    agents: dsl.agents,
    tasks: dsl.tasks,
    artifacts: dsl.artifacts,
    tools: dsl.tools,
    validations: dsl.validations,
    handoff_types: dsl.handoff_types,
    workflow: dsl.workflow,
    policies: dsl.policies,
  };
}

export function buildSystemContext(dsl: Dsl): SystemContext {
  return { system: dsl.system, dsl };
}

export function buildTaskContext(
  dsl: Dsl,
  taskId: string,
): PerTaskContext {
  const taskDef = dsl.tasks[taskId];
  const task = { ...taskDef, id: taskId } as Task & { id: string };
  const agentDef = dsl.agents[taskDef.target_agent];
  const targetAgent = agentDef
    ? ({ ...agentDef, id: taskDef.target_agent } as Agent & { id: string })
    : null;
  return { task, targetAgent, dsl };
}

export function buildArtifactContext(
  dsl: Dsl,
  artifactId: string,
): PerArtifactContext {
  const artifactDef = dsl.artifacts[artifactId];
  const artifact = { ...artifactDef, id: artifactId } as Artifact & { id: string };
  return { artifact, dsl };
}

export function buildToolContext(
  dsl: Dsl,
  toolId: string,
): PerToolContext {
  const toolDef = dsl.tools[toolId];
  const tool = { ...toolDef, id: toolId } as Tool & { id: string };
  return { tool, dsl };
}

export function buildValidationContext(
  dsl: Dsl,
  validationId: string,
): PerValidationContext {
  const validationDef = dsl.validations[validationId];
  const validation = { ...validationDef, id: validationId } as Validation & { id: string };
  return { validation, dsl };
}

export function buildHandoffTypeContext(
  dsl: Dsl,
  handoffTypeId: string,
): PerHandoffTypeContext {
  const htDef = dsl.handoff_types[handoffTypeId];
  const handoff_type = { ...htDef, id: handoffTypeId } as HandoffType & { id: string };
  const relatedTasks = Object.entries(dsl.tasks)
    .filter(
      ([, t]) =>
        t.invocation_handoff === handoffTypeId ||
        t.result_handoff === handoffTypeId,
    )
    .map(([id, t]) => ({ ...t, id }) as Task & { id: string });
  return { handoff_type, relatedTasks, dsl };
}

export function buildWorkflowContext(
  dsl: Dsl,
  workflowId: string,
): PerWorkflowContext {
  const wfDef = dsl.workflow[workflowId];
  const workflow = { ...wfDef, id: workflowId } as Workflow & { id: string };
  return { workflow, dsl };
}

export function buildPolicyContext(
  dsl: Dsl,
  policyId: string,
): PerPolicyContext {
  const policyDef = dsl.policies[policyId];
  const policy = { ...policyDef, id: policyId } as Policy & { id: string };
  return { policy, dsl };
}

function mergeRules(
  agentRules: Array<Record<string, unknown>>,
  taskRules: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const result = [...agentRules];
  const existingIds = new Set(result.map((r) => r["id"]));

  for (const rule of taskRules) {
    const id = rule["id"] as string;
    if (existingIds.has(id)) {
      const idx = result.findIndex((r) => r["id"] === id);
      result[idx] = rule;
    } else {
      result.push(rule);
    }
  }
  return result;
}

function mergeBehavioralSpec(
  agent: Agent,
  tasks: Task[],
): MergedBehavioralSpec {
  let responsibilities = agent.responsibilities ?? [];
  let constraints = agent.constraints ?? [];
  let rules = (agent.rules ?? []) as Array<Record<string, unknown>>;
  let antiPatterns = agent.anti_patterns ?? [];
  let escalation = (agent.escalation_criteria ?? []) as Array<Record<string, unknown>>;
  let executionSteps: Array<Record<string, unknown>> = [];
  let completionCriteria: string[] = [];

  for (const task of tasks) {
    responsibilities = [...responsibilities, ...(task.responsibilities ?? [])];
    constraints = [...constraints, ...(task.constraints ?? [])];
    rules = mergeRules(rules, (task.rules ?? []) as Array<Record<string, unknown>>);
    antiPatterns = [...antiPatterns, ...(task.anti_patterns ?? [])];
    escalation = [...escalation, ...(task.escalation_criteria ?? []) as Array<Record<string, unknown>>];
    executionSteps = [...executionSteps, ...((task.execution_steps ?? []) as Array<Record<string, unknown>>)];
    completionCriteria = [...completionCriteria, ...(task.completion_criteria ?? [])];
  }

  return {
    responsibilities,
    constraints,
    rules,
    anti_patterns: antiPatterns,
    escalation_criteria: escalation,
    execution_steps: executionSteps,
    completion_criteria: completionCriteria,
  };
}

function extractPayloadFieldNames(
  payload: Record<string, unknown>,
): string[] {
  const props = payload["properties"];
  if (props && typeof props === "object") {
    return Object.keys(props as Record<string, unknown>);
  }
  return Object.keys(payload);
}

function buildDelegatableTasks(
  dsl: Dsl,
  agentId: string,
): DelegatableTaskView[] {
  return Object.entries(dsl.tasks)
    .filter(([, t]) => t.allowed_from_agents.includes(agentId))
    .map(([taskId, t]) => {
      const invocationHandoff = dsl.handoff_types[t.invocation_handoff];
      const resultHandoff = dsl.handoff_types[t.result_handoff];
      return {
        id: taskId,
        description: t.description,
        target_agent: t.target_agent,
        workflow: t.workflow,
        input_artifacts: t.input_artifacts,
        invocation_handoff: t.invocation_handoff,
        invocation_payload_keys: invocationHandoff
          ? extractPayloadFieldNames(invocationHandoff.payload)
          : [],
        result_handoff: t.result_handoff,
        result_payload_keys: resultHandoff
          ? extractPayloadFieldNames(resultHandoff.payload)
          : [],
      };
    });
}

export function buildPerAgentContext(
  dsl: Dsl,
  agent: Agent & { id: string },
): PerAgentContext {
  const agentId = agent.id;
  const receivableTasks = Object.entries(dsl.tasks)
    .filter(([, t]) => t.target_agent === agentId)
    .map(([id, t]) => ({ ...t, id }) as (Task & Record<string, unknown>) & { id: string });
  const delegatableTasks = buildDelegatableTasks(dsl, agentId);

  const artifactIds = new Set([
    ...agent.can_read_artifacts,
    ...agent.can_write_artifacts,
  ]);
  const relatedArtifacts: Dsl["artifacts"] = {};
  for (const [id, art] of Object.entries(dsl.artifacts)) {
    if (artifactIds.has(id)) relatedArtifacts[id] = art;
  }

  const toolIdSet = new Set(agent.can_execute_tools);
  const relatedTools: Dsl["tools"] = {};
  for (const [id, tool] of Object.entries(dsl.tools)) {
    if (toolIdSet.has(id)) relatedTools[id] = tool;
  }

  const handoffKinds = new Set([
    ...agent.can_return_handoffs,
    ...receivableTasks.map((t) => t.invocation_handoff),
    ...receivableTasks.map((t) => t.result_handoff),
  ]);
  const relatedHandoffTypes: Dsl["handoff_types"] = {};
  for (const [kind, ht] of Object.entries(dsl.handoff_types)) {
    if (handoffKinds.has(kind)) relatedHandoffTypes[kind] = ht;
  }

  const rawReceivableTasks = receivableTasks.map(({ id: _id, ...rest }) => rest as Task);
  const mergedBehavior = mergeBehavioralSpec(agent, rawReceivableTasks);

  return {
    agent,
    tasks: receivableTasks,
    receivableTasks,
    delegatableTasks,
    relatedArtifacts,
    relatedTools,
    relatedHandoffTypes,
    mergedBehavior,
    dsl,
  };
}
