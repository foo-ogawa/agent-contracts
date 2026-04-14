
# agent-contracts

[![npm version](https://img.shields.io/npm/v/agent-contracts.svg)](https://www.npmjs.com/package/agent-contracts)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Design multi-agent systems as contracts.**

`agent-contracts` is a toolkit for declaratively defining multi-agent development workflows in **YAML DSL**, with **static validation, semantic linting, and prompt rendering**.

It is designed for teams that need more than “agents that happen to work”.
It helps you define, validate, and evolve:

- who each agent is
- what tasks can be delegated
- which artifacts exist and who owns them
- what validations are required
- how handoffs are structured
- how prompts are rendered from the design itself

Instead of letting workflow rules live only in prompts and code, `agent-contracts` makes the system **explicit, reviewable, and CI-checkable**.

---

## Why agent-contracts?

Most agent frameworks focus on **runtime execution**.

`agent-contracts` focuses on **design-time guarantees**.

As multi-agent systems grow, teams usually run into the same problems:

- agent responsibilities become ambiguous
- handoff rules drift across prompts
- artifact ownership is unclear
- validation logic is inconsistent
- prompts diverge from the intended workflow
- shared team conventions stop being enforceable

`agent-contracts` addresses this by treating your agent workflow as a **contract**, not just a set of prompts.

You can think of it as:

- **OpenAPI for multi-agent workflows**
- **a contract layer above runtime orchestration**
- **a source of truth for agent roles, handoffs, and artifact flows**

---

## Who this is for

`agent-contracts` is a strong fit for teams that build or operate:

- multi-agent coding workflows
- spec → implement → audit → release style pipelines
- internal agent platforms
- review-heavy or gate-heavy delivery processes
- agent systems where artifact ownership matters
- reusable team definitions shared across projects

Typical users include:

- platform teams standardizing agent workflows
- engineering teams building internal coding/review agents
- products that require explicit validation and handoff policies
- teams that want CI enforcement for agent design consistency

---

## Who this is not for

`agent-contracts` is probably **not** the right starting point if you want:

- a single-agent chatbot
- a quick prompt prototype
- an all-in-one hosted agent runtime
- built-in scheduling, memory, tracing, or hosting
- a purely code-first orchestration style with no declarative spec
- maximum flexibility with minimal process constraints

In short:

- if you want to **run agents quickly**, start with a runtime framework
- if you want to **design multi-agent systems that stay coherent over time**, use `agent-contracts`

---

## What makes it different?

`agent-contracts` does not try to replace every agent framework.

It occupies a different layer.

### Positioning

| Product / approach | Primary focus | Best fit | How `agent-contracts` differs |
|---|---|---|---|
| **OpenAI Agents SDK** | runtime execution with instructions, tools, and handoffs | apps built around agent runtime behavior | `agent-contracts` focuses on design contracts, static guarantees, and artifact relationships |
| **CrewAI** | agent/task workflow orchestration | teams that want runtime task execution in YAML | `agent-contracts` goes deeper on validation, ownership, inheritance, and renderable design specs |
| **AutoGen** | code-first multi-agent programming | research or custom orchestration flows | `agent-contracts` is more declarative, reviewable, and CI-oriented |
| **Google ADK style patterns** | choosing runtime interaction patterns | production systems built around runtime composition | `agent-contracts` is framework-agnostic and centered on workflow design as a contract |

The key distinction is simple:

> Other frameworks mainly answer: **How do I run these agents?**  
> `agent-contracts` answers: **What is the allowed structure of this agent system, and how do we keep it correct as it evolves?**

This positioning is consistent with common industry patterns: some frameworks center the agent runtime, others separate agent definition and task invocation, but `agent-contracts` is strongest as a **design-time contract layer** across those execution models.

---

## Quick Start

Define your system in a single YAML file:

```yaml
# agent-contracts.yaml
version: 1
system:
  id: my-project
  name: My Agent Workflow
  default_phase_order: [design, implement]

agents:
  architect:
    role_name: "Architect"
    purpose: "Drive phases and delegate work"
    can_invoke_agents: [implementer]

  implementer:
    role_name: "Implementer"
    purpose: "Implement features based on specs"

tasks:
  implement-feature:
    description: "Delegate feature implementation"
    target_agent: implementer
    allowed_from_agents: [architect]
    phase: implement
    input_artifacts: [spec-md]
    invocation_handoff: task-delegation
    result_handoff: implementation-result

artifacts:
  spec-md:
    type: document
    owner: architect
    producers: [architect]
    editors: [architect]
    consumers: [implementer]
    states: [draft, reviewed, approved]
````

Validate and render:

````bash
agent-contracts validate
agent-contracts render -c agent-contracts.config.yaml
````


A working example is available in [`sample/`](./sample), including:

* [`sample/agent-contracts.yaml`](./sample/agent-contracts.yaml)
* [`sample/agent-contracts.config.yaml`](./sample/agent-contracts.config.yaml)
* [`sample/templates`](./sample/templates)
* [`sample/output`](./sample/output)

---

## Core concepts

### Agent

An **Agent** defines who an execution entity is:

* role name
* purpose
* capabilities
* permissions
* constraints
* behavioral rules

### Task

A **Task** defines a delegatable unit of work:

* target agent
* allowed callers
* phase
* input artifacts
* invocation/result handoffs
* task-specific execution expectations

### Artifact

An **Artifact** defines the objects that move through the workflow:

* owner
* producers
* editors
* consumers
* states
* required validations
* visibility

### Handoff

A **Handoff** is a runtime delegation instance.
The YAML defines the allowed handoff types and constraints; concrete handoffs are created at runtime.

---

## Why teams adopt it

### 1. Explicit workflow design

Your architecture stops living only in prompts, code, and tribal knowledge.

### 2. Static guarantees before runtime

You can catch broken references, invalid ownership, missing validations, and workflow inconsistencies before execution.

### 3. Prompt generation from source of truth

Rendered prompts come from the same DSL that defines roles, tasks, artifacts, and policies.

### 4. Reuse across teams and projects

Shared base definitions can be extended safely with `extends`.

### 5. Better CI discipline

Design regressions become testable.

---

## Features

* **Declarative YAML DSL** for multi-agent development workflows
* **Static schema validation**
* **Reference integrity checks**
* **Semantic linting**
* **Structured handoff definitions**
* **Artifact ownership and lifecycle modeling**
* **Config-driven prompt rendering**
* **Inheritance with merge operators via `extends`**
* **Flexible file splitting** via `$ref` (replacement) and `$refs` (import + deep-merge)
* **JSON Schema for editor support and external tooling**
* **CI-friendly workflow checks**

---

## DSL structure

Entities are defined as **maps keyed by ID**.

````yaml
version: 1
extends: "./base/"

system:
  id: my-project
  name: My Agent Workflow
  default_phase_order:
    - analyze
    - specify
    - plan
    - implement
    - audit
    - release
    - reflect

agents: {}
tasks: {}
artifacts: {}
tools: {}
validations: {}
handoff_types: {}
workflow: {}
policies: {}
````

This makes definitions easy to merge, extend, and reference by stable identifiers.

### Single-file format

````yaml
version: 1
system: { ... }
agents: { ... }
tasks: { ... }
artifacts: { ... }
````

### Multi-file format (section-level `$ref`)

````yaml
version: 1
extends: "./base/"
system:
  id: my-project
  name: My Agent Workflow
  default_phase_order: [analyze, specify, plan, implement, audit, release, reflect]

agents: { $ref: "./agents.yaml" }
tasks: { $ref: "./tasks.yaml" }
artifacts: { $ref: "./artifacts.yaml" }
tools: { $ref: "./tools.yaml" }
validations: { $ref: "./validations.yaml" }
handoff_types: { $ref: "./handoff-types.yaml" }
workflow: { $ref: "./workflow.yaml" }
policies: { $ref: "./policies.yaml" }
````

### Per-entry `$ref`

`$ref` can be used at any object position. This allows splitting individual entries into separate files:

````yaml
agents:
  architect: { $ref: "./agents/architect.yaml" }
  implementer: { $ref: "./agents/implementer.yaml" }
  test-writer: { $ref: "./agents/test-writer.yaml" }
````

Each referenced file contains the agent definition directly (without the key):

````yaml
# agents/architect.yaml
role_name: "Architect"
purpose: "Drive phases and delegate work"
can_invoke_agents: [implementer]
````

### Directory `$ref`

When `$ref` points to a directory, all `*.yaml` / `*.yml` files in the directory are loaded and merged:

````yaml
agents: { $ref: "./agents/" }
````

Each file in the directory contains one or more keyed entries:

````yaml
# agents/architect.yaml
architect:
  role_name: "Architect"
  purpose: "Drive phases and delegate work"
````

Files are loaded in alphabetical order. Conflicting leaf values across files result in an error.

### `$refs` (import and merge)

`$refs` imports multiple files and **deep-merges** them into the containing map.
Unlike `$ref` (which replaces an object entirely), `$refs` allows mixing inline definitions with external files.

````yaml
agents:
  inline-agent:
    role_name: "Inline Agent"
    purpose: "Defined right here"
  $refs:
    - "./agents/architect.yaml"
    - "./agents/implementer.yaml"
    - "./more-agents/"           # directories are also supported
````

Each referenced file uses the same keyed format:

````yaml
# agents/architect.yaml
architect:
  role_name: "Architect"
  purpose: "Drive phases and delegate work"
````

`$refs` can also be used at the root level to compose a DSL from multiple aspect-oriented files:

````yaml
version: 1
system:
  id: my-project
  name: My Agent Workflow
  default_phase_order: [analyze, implement]
$refs:
  - "./agents-core.yaml"        # agents + artifacts definitions
  - "./agents-constraints.yaml"  # constraints for the same agents
  - "./tasks.yaml"
````

Overlapping map keys are deep-merged recursively. Conflicting leaf values (scalar or array) result in an error.

| Directive | Type   | Behavior                                                 |
| --------- | ------ | -------------------------------------------------------- |
| `$ref`    | string | Replace the object at that position with file contents   |
| `$refs`   | array  | Import files and deep-merge into the containing map      |

---

## Example: Agent definition

````yaml
agents:
  main-architect:
    role_name: "Architect"
    purpose: "Drive phases, delegate, make gate decisions, integrate audits"
    dispatch_only: true
    mode: read-only
    can_read_artifacts:
      - spec-md
      - codebase
      - test-report
    can_write_artifacts:
      - review-note
    can_execute_tools:
      - spec-impact-check
    can_perform_validations:
      - evidence-gate-review
    can_invoke_agents:
      - implementer
      - test-writer
    can_return_handoffs:
      - evidence-gate-verdict

    responsibilities:
      - "Manage phase progression and gate decisions"
    constraints:
      - "Never write code directly"

    x-identity: |
      You act as the Architect. You NEVER implement or test directly.
      Instead you delegate to specialist sub-agents.
````

---

## Example: Task definition

````yaml
tasks:
  implement-feature:
    description: "Delegate feature implementation"
    target_agent: implementer
    allowed_from_agents:
      - main-architect
    phase: implement
    input_artifacts:
      - spec-md
      - plan-md
    invocation_handoff: task-delegation
    result_handoff: dependency-evidence
    responsibilities:
      - "Implement all requirements from spec-md"
    execution_steps:
      - id: read-specs
        action: "Read spec-md and design-docs"
      - id: implement
        action: "Implement changes in codebase"
      - id: run-db-lint
        action: "Run db-lint"
        uses_tool: db-lint
    completion_criteria:
      - "canonical artifacts updated"
````

---

## Example: Artifact definition

````yaml
artifacts:
  spec-md:
    type: document
    description: "Specification document"
    owner: main-architect
    producers: [main-architect]
    editors: [main-architect]
    consumers: [implementer, test-writer]
    states: [draft, reviewed, approved]
    required_validations: [spec-semantic-review]
    visibility: internal
````

---

## Inheritance and merge operators

`agent-contracts` supports shared base definitions with project-level overrides through `extends`.

````yaml
extends: "./base/"

agents:
  implementer:
    constraints:
      $append:
        - "Use only approved external libraries"

  designer:
    role_name: "Designer"
    purpose: "UI design"

tasks:
  implement-feature:
    execution_steps:
      $insert_after:
        target: run-db-lint
        items:
          - id: run-contract-pipeline
            action: "Run contract pipeline"
            uses_tool: api-pipeline
````

Supported merge operators:

| Operator        | Behavior                                   |
| --------------- | ------------------------------------------ |
| `$append`       | Append entries to end of map/array         |
| `$prepend`      | Prepend entries to beginning of map/array  |
| `$insert_after` | Insert after element with specified key/id |
| `$replace`      | Replace entire value                       |
| `$remove`       | Remove entries by key/id                   |
| direct value    | Override scalar field                      |

---

## CLI

### Installation

````bash
npm install -g agent-contracts
npm install -D agent-contracts
npx agent-contracts
````

### Main commands

| Command                           | Description                                            |
| --------------------------------- | ------------------------------------------------------ |
| `agent-contracts resolve [path]`  | Resolve `extends` inheritance and output resolved YAML |
| `agent-contracts validate [path]` | Validate schema and references                         |
| `agent-contracts lint [path]`     | Run semantic lint                                      |
| `agent-contracts render`          | Render outputs from config                             |
| `agent-contracts check`           | Run resolve → validate → lint → render --check         |

The `[path]` argument defaults to `agent-contracts.yaml` in the current directory.
If `-c` / `--config` is specified, the DSL path from the config file is used.

### Common usage

````bash
agent-contracts resolve
agent-contracts validate
agent-contracts lint --strict
agent-contracts render -c agent-contracts.config.yaml
agent-contracts render -c agent-contracts.config.yaml --check
agent-contracts check -c agent-contracts.config.yaml --strict
````

---

## Config-driven rendering

Rendering is configured via `agent-contracts.config.yaml`.

````yaml
dsl: ./agent-contracts.yaml

renders:
  - template: ./templates/agent-prompt.md.hbs
    context: agent
    output: ./output/{agent.id}.md

  - template: ./templates/overview.md.hbs
    context: system
    output: ./output/overview.md
````

This lets you generate static outputs for:

* agent prompts
* task specs
* overviews
* artifact docs
* validation docs
* workflow docs

all from the same resolved DSL.

---

## Validation model

`agent-contracts` validates your system in multiple layers.

### Schema validation

Checks:

* required fields
* types
* enums
* handoff payload shape
* invalid custom properties without `x-` prefix

### Reference integrity

Checks:

* cross-entity references
* owner / producer / editor / consumer validity
* handoff and payload consistency
* permission alignment between agents and artifacts

### Semantic lint

Checks:

* bidirectional consistency
* validation coverage
* workflow graph completeness
* merge integrity
* read-only write violations
* prerequisite readability
* naming/style issues through Spectral rules

---

## Best used with runtime frameworks

`agent-contracts` works well alongside runtime frameworks and internal agent infrastructure.

A practical model is:

1. define the workflow in YAML
2. validate and lint it in CI
3. render prompts and derived docs
4. execute the workflow in your runtime of choice

That separation keeps runtime concerns and architecture concerns from being mixed together.

---

## Tech stack

| Category     | Choice                             |
| ------------ | ---------------------------------- |
| Language     | TypeScript (ESM, strict mode)      |
| Schema       | Zod                                |
| YAML parsing | yaml                               |
| Lint         | TypeScript custom rules + Spectral |
| Templates    | Handlebars                         |
| CLI          | commander                          |
| Testing      | Vitest                             |
| Build        | tsup                               |

---

## License

MIT
