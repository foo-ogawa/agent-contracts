import type {
  Dsl,
  Agent,
  Task,
  Workflow,
  WorkflowStep,
  ExecutionStep,
} from "../schema/index.js";

interface ParticipantInfo {
  id: string;
  alias: string;
  label: string;
  group: "agents" | "toolchain" | "artifacts";
}

function hashToColor(s: string, saturation: number, lightness: number): string {
  let hash = 0;
  for (const ch of s) hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0;
  const h = ((hash % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lightness - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return `rgb(${Math.round((r + m) * 255)},${Math.round((g + m) * 255)},${Math.round((b + m) * 255)})`;
}

function sanitizeAlias(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, "_");
}

function agentAlias(id: string, agent: Agent): string {
  const words = agent.role_name.split(/\s+/);
  if (words.length === 1) return sanitizeAlias(words[0].slice(0, 4));
  return sanitizeAlias(words.map((w) => w[0]).join(""));
}

interface CollectedIds {
  agents: Set<string>;
  tools: Set<string>;
  artifacts: Set<string>;
}

function collectReferencedIds(
  workflow: Workflow & { id: string },
  dsl: Dsl,
  relatedTasks: Array<Task & { id: string }>,
): CollectedIds {
  const agents = new Set<string>();
  const tools = new Set<string>();
  const artifacts = new Set<string>();

  const taskMap = new Map<string, Task & { id: string }>();
  for (const t of relatedTasks) taskMap.set(t.id, t);

  for (const step of workflow.steps) {
    if (step.type === "handoff") {
      if (step.from_agent) agents.add(step.from_agent);
      if (step.task) {
        const task = taskMap.get(step.task);
        if (task) {
          agents.add(task.target_agent);
          for (const es of task.execution_steps ?? []) {
            collectExecutionStepIds(es, tools, artifacts);
          }
        }
      }
    } else if (step.type === "validation") {
      const val = dsl.validations[step.validation];
      if (val) {
        if (val.executor_type === "agent") agents.add(val.executor);
        else tools.add(val.executor);
        artifacts.add(val.target_artifact);
      }
    } else if (step.type === "decision") {
      // decisions reference agents contextually via the most recent from_agent
    }
  }

  return { agents, tools, artifacts };
}

function collectExecutionStepIds(
  es: ExecutionStep,
  tools: Set<string>,
  artifacts: Set<string>,
): void {
  if (es.uses_tool) tools.add(es.uses_tool);
  if (es.produces_artifact) artifacts.add(es.produces_artifact);
  if (es.reads_artifact) artifacts.add(es.reads_artifact);
}

function buildParticipants(
  ids: CollectedIds,
  dsl: Dsl,
): ParticipantInfo[] {
  const participants: ParticipantInfo[] = [];
  const usedAliases = new Set<string>();

  function uniqueAlias(preferred: string): string {
    let alias = preferred;
    let i = 2;
    while (usedAliases.has(alias)) {
      alias = `${preferred}${i}`;
      i++;
    }
    usedAliases.add(alias);
    return alias;
  }

  for (const id of ids.agents) {
    const agent = dsl.agents[id];
    if (!agent) continue;
    const alias = uniqueAlias(agentAlias(id, agent));
    participants.push({ id, alias, label: agent.role_name, group: "agents" });
  }

  for (const id of ids.tools) {
    const tool = dsl.tools[id];
    if (!tool) continue;
    const alias = uniqueAlias(sanitizeAlias(id));
    participants.push({ id, alias, label: id, group: "toolchain" });
  }

  for (const id of ids.artifacts) {
    const art = dsl.artifacts[id];
    if (!art) continue;
    const alias = uniqueAlias(sanitizeAlias(id));
    participants.push({ id, alias, label: id, group: "artifacts" });
  }

  return participants;
}

function participantAlias(participants: ParticipantInfo[], id: string): string {
  const p = participants.find((pp) => pp.id === id);
  return p ? p.alias : sanitizeAlias(id);
}

function emitParticipants(
  participants: ParticipantInfo[],
  lines: string[],
  indent: string,
): void {
  const groups: Record<string, ParticipantInfo[]> = {
    agents: [],
    toolchain: [],
    artifacts: [],
  };
  for (const p of participants) groups[p.group].push(p);

  const groupConfig: Array<{ key: string; label: string; color: string }> = [
    { key: "agents", label: "Agents", color: "rgb(200,220,255)" },
    { key: "toolchain", label: "Toolchain", color: "rgb(220,255,220)" },
    { key: "artifacts", label: "Artifacts", color: "rgb(255,230,210)" },
  ];

  for (const { key, label, color } of groupConfig) {
    const members = groups[key];
    if (members.length === 0) continue;
    lines.push(`${indent}box ${color} ${label}`);
    for (const p of members) {
      if (p.alias === p.label) {
        lines.push(`${indent}participant ${p.alias}`);
      } else {
        lines.push(`${indent}participant ${p.alias} as ${p.label}`);
      }
    }
    lines.push(`${indent}end`);
  }
}

function emitHandoffStep(
  step: Extract<WorkflowStep, { type: "handoff" }>,
  participants: ParticipantInfo[],
  dsl: Dsl,
  relatedTasks: Array<Task & { id: string }>,
  lines: string[],
  indent: string,
): void {
  const taskMap = new Map<string, Task & { id: string }>();
  for (const t of relatedTasks) taskMap.set(t.id, t);

  if (!step.task) {
    if (step.from_agent) {
      const fromAlias = participantAlias(participants, step.from_agent);
      lines.push(`${indent}${fromAlias}->>${fromAlias}: ${step.handoff_kind}`);
    }
    return;
  }

  const task = taskMap.get(step.task);
  if (!task) return;

  const fromAlias = step.from_agent
    ? participantAlias(participants, step.from_agent)
    : null;
  const targetAlias = participantAlias(participants, task.target_agent);

  if (fromAlias) {
    lines.push(`${indent}${fromAlias}->>${targetAlias}: delegate ${step.task}`);
  }

  for (const es of task.execution_steps ?? []) {
    emitExecutionStep(es, targetAlias, participants, lines, indent);
  }

  if (fromAlias) {
    lines.push(`${indent}${targetAlias}-->>${fromAlias}: ${task.result_handoff}`);
  }
}

function emitExecutionStep(
  es: ExecutionStep,
  agentAlias: string,
  participants: ParticipantInfo[],
  lines: string[],
  indent: string,
): void {
  if (es.reads_artifact) {
    const artAlias = participantAlias(participants, es.reads_artifact);
    lines.push(`${indent}${agentAlias}->>${artAlias}: [R] ${es.action}`);
  }
  if (es.produces_artifact) {
    const artAlias = participantAlias(participants, es.produces_artifact);
    lines.push(`${indent}${agentAlias}->>${artAlias}: [W] ${es.action}`);
  }
  if (es.uses_tool) {
    const toolAlias = participantAlias(participants, es.uses_tool);
    lines.push(`${indent}${agentAlias}->>${toolAlias}: ${es.action}`);
  }
  if (!es.reads_artifact && !es.produces_artifact && !es.uses_tool) {
    lines.push(`${indent}${agentAlias}->>${agentAlias}: ${es.action}`);
  }
}

function emitValidationStep(
  step: Extract<WorkflowStep, { type: "validation" }>,
  participants: ParticipantInfo[],
  dsl: Dsl,
  lastFromAgent: string | undefined,
  lines: string[],
  indent: string,
): void {
  const val = dsl.validations[step.validation];
  if (!val) return;

  const executorAlias = participantAlias(participants, val.executor);
  const artifactAlias = participantAlias(participants, val.target_artifact);
  const fromAlias = lastFromAgent
    ? participantAlias(participants, lastFromAgent)
    : null;

  if (fromAlias && fromAlias !== executorAlias) {
    lines.push(`${indent}${fromAlias}->>${executorAlias}: ${step.validation}`);
  }
  lines.push(`${indent}${executorAlias}->>${artifactAlias}: [R] ${val.target_artifact}`);
  if (fromAlias && fromAlias !== executorAlias) {
    lines.push(`${indent}${executorAlias}-->>${fromAlias}: results`);
  }
}

function emitDecisionStep(
  step: Extract<WorkflowStep, { type: "decision" }>,
  participants: ParticipantInfo[],
  lastFromAgent: string | undefined,
  lines: string[],
  indent: string,
): void {
  const branches = Object.entries(step.branches);
  if (branches.length === 0) return;

  const agentAlias = lastFromAgent
    ? participantAlias(participants, lastFromAgent)
    : null;

  for (let i = 0; i < branches.length; i++) {
    const [key, values] = branches[i];
    if (i === 0) {
      lines.push(`${indent}alt ${key}`);
    } else {
      lines.push(`${indent}else ${key}`);
    }
    if (agentAlias) {
      lines.push(`${indent}    Note over ${agentAlias}: ${values.join(", ")}`);
    } else {
      lines.push(`${indent}    Note right of ${participantAlias(participants, [...new Set<string>()].join(""))}: ${values.join(", ")}`);
    }
  }
  lines.push(`${indent}end`);
}

export function generateSequenceDiagram(
  workflow: Workflow & { id: string },
  relatedTasks: Array<(Task & Record<string, unknown>) & { id: string }>,
  dsl: Dsl,
): string {
  const ids = collectReferencedIds(workflow, dsl, relatedTasks);
  const participants = buildParticipants(ids, dsl);
  const lines: string[] = [];
  const indent = "    ";

  lines.push("sequenceDiagram");
  emitParticipants(participants, lines, indent);

  lines.push("");
  lines.push(`${indent}rect ${hashToColor(workflow.id, 0.15, 0.95)}`);

  const firstP = participants[0];
  const lastP = participants[participants.length - 1];
  if (firstP && lastP) {
    const noteLabel = workflow.description
      ? `${workflow.id} — ${workflow.description}`
      : workflow.id;
    lines.push(`${indent}Note over ${firstP.alias},${lastP.alias}: ${noteLabel}`);
  }

  let lastFromAgent: string | undefined;
  for (const step of workflow.steps) {
    lines.push("");
    if (step.type === "handoff") {
      if (step.from_agent) lastFromAgent = step.from_agent;
      emitHandoffStep(step, participants, dsl, relatedTasks, lines, indent);
    } else if (step.type === "validation") {
      emitValidationStep(step, participants, dsl, lastFromAgent, lines, indent);
    } else if (step.type === "decision") {
      emitDecisionStep(step, participants, lastFromAgent, lines, indent);
    }
  }

  lines.push("");
  lines.push(`${indent}end`);

  return lines.join("\n");
}
