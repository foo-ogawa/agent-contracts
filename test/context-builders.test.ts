import { describe, it, expect } from "vitest";
import type { Dsl } from "../src/schema/index.js";
import {
  buildSystemContext,
  buildPerAgentContext,
  buildTaskContext,
  buildArtifactContext,
  buildToolContext,
  buildValidationContext,
  buildHandoffTypeContext,
  buildWorkflowContext,
  buildPolicyContext,
} from "../src/renderer/context.js";

function createMinimalDsl(): Dsl {
  return {
    version: 1,
    system: {
      id: "test-system",
      name: "Test System",
      default_workflow_order: ["plan", "implement"],
    },
    agents: {
      dev: {
        role_name: "Developer",
        purpose: "Write code",
        can_read_artifacts: ["source-code"],
        can_write_artifacts: ["source-code"],
        can_execute_tools: ["lint"],
        can_perform_validations: [],
        can_invoke_agents: [],
        can_return_handoffs: ["task-result"],
      },
      reviewer: {
        role_name: "Reviewer",
        purpose: "Review code",
        can_read_artifacts: ["source-code"],
        can_write_artifacts: [],
        can_execute_tools: [],
        can_perform_validations: ["code-review"],
        can_invoke_agents: [],
        can_return_handoffs: ["task-result"],
      },
    },
    tasks: {
      "implement-feature": {
        description: "Implement a feature",
        target_agent: "dev",
        allowed_from_agents: ["reviewer"],
        workflow: "implement",
        input_artifacts: ["source-code"],
        invocation_handoff: "task-request",
        result_handoff: "task-result",
      },
      "review-code": {
        description: "Review code changes",
        target_agent: "reviewer",
        allowed_from_agents: ["dev"],
        workflow: "implement",
        input_artifacts: ["source-code"],
        invocation_handoff: "task-request",
        result_handoff: "task-result",
      },
    },
    artifacts: {
      "source-code": {
        type: "code",
        description: "Application source code",
        owner: "dev",
        producers: ["dev"],
        editors: ["dev"],
        consumers: ["reviewer"],
        states: ["draft", "reviewed"],
        required_validations: ["code-review"],
      },
    },
    tools: {
      lint: {
        kind: "static-analysis",
        description: "Run linter",
        input_artifacts: ["source-code"],
        output_artifacts: [],
        invokable_by: ["dev"],
        side_effects: [],
      },
    },
    validations: {
      "code-review": {
        target_artifact: "source-code",
        kind: "semantic",
        executor_type: "agent",
        executor: "reviewer",
        blocking: true,
      },
    },
    handoff_types: {
      "task-request": {
        version: 1,
        description: "Task invocation",
        payload: { properties: { message: { type: "string" } } },
      },
      "task-result": {
        version: 1,
        description: "Task result",
        payload: { properties: { result: { type: "string" } } },
      },
    },
    workflow: {
      plan: {
        entry_conditions: ["requirement exists"],
        steps: [
          { type: "handoff", handoff_kind: "task-request", task: "implement-feature" },
        ],
      },
      implement: {
        entry_conditions: [],
        steps: [
          { type: "validation", validation: "code-review" },
        ],
      },
    },
    policies: {
      "review-before-merge": {
        when: { artifact_type: "code" },
        requires_validations: ["code-review"],
      },
    },
  };
}

describe("buildSystemContext", () => {
  it("provides system and full dsl", () => {
    const dsl = createMinimalDsl();
    const ctx = buildSystemContext(dsl);
    expect(ctx.system).toBe(dsl.system);
    expect(ctx.dsl).toBe(dsl);
    expect(ctx.system.name).toBe("Test System");
  });
});

describe("buildPerAgentContext", () => {
  it("includes dsl reference", () => {
    const dsl = createMinimalDsl();
    const ctx = buildPerAgentContext(dsl, { ...dsl.agents["dev"], id: "dev" });
    expect(ctx.dsl).toBe(dsl);
    expect(ctx.agent.id).toBe("dev");
    expect(ctx.receivableTasks.length).toBeGreaterThan(0);
    expect(ctx.relatedTools).toHaveProperty("lint");
  });
});

describe("buildTaskContext", () => {
  it("provides task with id, target agent, and dsl", () => {
    const dsl = createMinimalDsl();
    const ctx = buildTaskContext(dsl, "implement-feature");
    expect(ctx.task.id).toBe("implement-feature");
    expect(ctx.task.description).toBe("Implement a feature");
    expect(ctx.targetAgent).not.toBeNull();
    expect(ctx.targetAgent!.id).toBe("dev");
    expect(ctx.dsl).toBe(dsl);
  });
});

describe("buildArtifactContext", () => {
  it("provides artifact with id and dsl", () => {
    const dsl = createMinimalDsl();
    const ctx = buildArtifactContext(dsl, "source-code");
    expect(ctx.artifact.id).toBe("source-code");
    expect(ctx.artifact.type).toBe("code");
    expect(ctx.dsl).toBe(dsl);
  });

  it("includes relatedTools that reference the artifact as input or output", () => {
    const dsl = createMinimalDsl();
    const ctx = buildArtifactContext(dsl, "source-code");
    expect(ctx.relatedTools).toHaveProperty("lint");
  });

  it("includes relatedValidations targeting the artifact", () => {
    const dsl = createMinimalDsl();
    const ctx = buildArtifactContext(dsl, "source-code");
    expect(ctx.relatedValidations).toHaveProperty("code-review");
  });

  it("resolves producer, consumer, and editor agents", () => {
    const dsl = createMinimalDsl();
    const ctx = buildArtifactContext(dsl, "source-code");
    expect(ctx.producerAgents).toHaveProperty("dev");
    expect(ctx.consumerAgents).toHaveProperty("reviewer");
    expect(ctx.editorAgents).toHaveProperty("dev");
  });

  it("lists workflows where the artifact is written", () => {
    const dsl = createMinimalDsl();
    const ctx = buildArtifactContext(dsl, "source-code");
    expect(ctx.createdInWorkflows).toContain("implement");
  });
});

describe("buildToolContext", () => {
  it("provides tool with id and dsl", () => {
    const dsl = createMinimalDsl();
    const ctx = buildToolContext(dsl, "lint");
    expect(ctx.tool.id).toBe("lint");
    expect(ctx.tool.kind).toBe("static-analysis");
    expect(ctx.dsl).toBe(dsl);
  });

  it("resolves invokableAgents from invokable_by", () => {
    const dsl = createMinimalDsl();
    const ctx = buildToolContext(dsl, "lint");
    expect(ctx.invokableAgents).toHaveProperty("dev");
    expect(Object.keys(ctx.invokableAgents)).toHaveLength(1);
  });

  it("resolves input and output artifact details", () => {
    const dsl = createMinimalDsl();
    const ctx = buildToolContext(dsl, "lint");
    expect(ctx.inputArtifactDetails).toHaveProperty("source-code");
    expect(Object.keys(ctx.outputArtifactDetails)).toHaveLength(0);
  });
});

describe("buildValidationContext", () => {
  it("provides validation with id and dsl", () => {
    const dsl = createMinimalDsl();
    const ctx = buildValidationContext(dsl, "code-review");
    expect(ctx.validation.id).toBe("code-review");
    expect(ctx.validation.kind).toBe("semantic");
    expect(ctx.dsl).toBe(dsl);
  });
});

describe("buildHandoffTypeContext", () => {
  it("provides handoff type with related tasks", () => {
    const dsl = createMinimalDsl();
    const ctx = buildHandoffTypeContext(dsl, "task-request");
    expect(ctx.handoff_type.id).toBe("task-request");
    expect(ctx.relatedTasks.length).toBeGreaterThan(0);
    expect(ctx.dsl).toBe(dsl);
  });
});

describe("buildWorkflowContext", () => {
  it("provides workflow phase with id and dsl", () => {
    const dsl = createMinimalDsl();
    const ctx = buildWorkflowContext(dsl, "plan");
    expect(ctx.workflow.id).toBe("plan");
    expect(ctx.workflow.steps).toHaveLength(1);
    expect(ctx.dsl).toBe(dsl);
  });

  it("collects relatedTasks matching the workflow phase", () => {
    const dsl = createMinimalDsl();
    const ctx = buildWorkflowContext(dsl, "implement");
    const taskIds = ctx.relatedTasks.map((t) => t.id);
    expect(taskIds).toContain("implement-feature");
    expect(taskIds).toContain("review-code");
  });

  it("does not include tasks from other phases", () => {
    const dsl = createMinimalDsl();
    const ctx = buildWorkflowContext(dsl, "plan");
    expect(ctx.relatedTasks).toHaveLength(0);
  });

  it("collects relatedAgents from tasks and workflow steps", () => {
    const dsl = createMinimalDsl();
    const ctx = buildWorkflowContext(dsl, "implement");
    expect(ctx.relatedAgents).toHaveProperty("dev");
    expect(ctx.relatedAgents).toHaveProperty("reviewer");
  });

  it("collects relatedTools from agents involved in the phase", () => {
    const dsl = createMinimalDsl();
    const ctx = buildWorkflowContext(dsl, "implement");
    expect(ctx.relatedTools).toHaveProperty("lint");
  });

  it("collects relatedArtifacts from tasks and agents", () => {
    const dsl = createMinimalDsl();
    const ctx = buildWorkflowContext(dsl, "implement");
    expect(ctx.relatedArtifacts).toHaveProperty("source-code");
  });

  it("collects relatedValidations from workflow steps", () => {
    const dsl = createMinimalDsl();
    const ctx = buildWorkflowContext(dsl, "implement");
    expect(ctx.relatedValidations).toHaveProperty("code-review");
  });

  it("includes agent executor from validation step", () => {
    const dsl = createMinimalDsl();
    const ctx = buildWorkflowContext(dsl, "implement");
    expect(ctx.relatedAgents).toHaveProperty("reviewer");
  });
});

describe("buildPolicyContext", () => {
  it("provides policy with id and dsl", () => {
    const dsl = createMinimalDsl();
    const ctx = buildPolicyContext(dsl, "review-before-merge");
    expect(ctx.policy.id).toBe("review-before-merge");
    expect(ctx.policy.when.artifact_type).toBe("code");
    expect(ctx.dsl).toBe(dsl);
  });
});
