# agent-contracts

A toolkit for declaratively defining multi-agent development workflows in **YAML DSL**, with static validation, linting, and prompt rendering.

Designed for teams building multi-agent coding or review workflows that need static guarantees on agent roles, handoffs, and artifact ownership.

## Quick Start

Define your agents, tasks, and artifacts in a single YAML file:

```yaml
# agent-contracts.yaml
version: 1
system:
  id: my-project
  name: My Agent Workflow

agents:
  - id: architect
    role_name: "Architect"
    purpose: "Drive phases and delegate work"
    can_invoke_agents: [implementer]

  - id: implementer
    role_name: "Implementer"
    purpose: "Implement features based on specs"

tasks:
  - id: implement-feature
    target_agent: implementer
    allowed_from_agents: [architect]
    phase: implement
    input_artifacts: [spec-md]

artifacts:
  - id: spec-md
    type: document
    owner: architect
    consumers: [implementer]
```

Then validate and render:

```bash
agent-contracts validate ./my-project
agent-contracts render ./my-project --template-dir ./templates --output-dir ./rendered
```

## Features

- **Define agent responsibilities, permissions, and handoff relationships** in structured YAML
- **Track artifact ownership, editors, consumers, and validation requirements**
- **Detect design flaws statically** via Schema Validation + Semantic Lint
- **Define and validate handoff payloads** with structured schemas
- **Generate static agent prompts (md)** from Handlebars templates via Prompt Renderer
- **Separate common and project-specific definitions** using the `extends` inheritance mechanism

## Design Philosophy

Just as OpenAPI represents "API contracts," agent-contracts expresses **the entire operational design — including agent organization, artifacts, validation, and handoffs** — in YAML.

### 3-Layer Model

| Layer | Role | Defined in |
|---|---|---|
| **Agent** | Capability declaration and general behavioral spec of the execution entity | `agents` |
| **Task** | A type of work that can be delegated to an agent, with task-specific behavioral spec | `tasks` |
| **Handoff** | A concrete delegation instance (runtime object, not predefined in YAML) | Generated at runtime |

### Definition Inheritance and Override

```text
base definition (shared team definition)
  ↓ project definition references base via extends
    ↓ id-based deep merge + merge operators apply diffs
      → resolved YAML (final result)
```

Inheritance is currently modeled as two layers: base and project. Priority: **project > base**.

---

## DSL Structure

### Top Level

```yaml
version: 1
extends: "@agent-contracts/base-team"  # Inheritance source (optional; standalone if omitted)

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

agents: []
tasks: []
artifacts: []
tools: []
validations: []
handoff_types: []
workflow: []
policies: []
```

### File Organization

**Single-file format** — All sections in one YAML file:

```yaml
# agent-contracts.yaml
version: 1
system: { ... }
agents: [...]
tasks: [...]
artifacts: [...]
```

**Multi-file format** — Entry point references split files via `$ref`:

```yaml
# agent-contracts.yaml
version: 1
extends: "@agent-contracts/base-team"
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
```

---

## DSL Definition Examples

### Agent Definition

```yaml
agents:
  - id: main-architect
    role_name: "Architect"
    purpose: "Drive phases, delegate, make gate decisions, integrate audits"
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

    # General behavioral spec (common across all tasks)
    responsibilities:
      - "Manage phase progression and gate decisions"
    constraints:
      - "Never write code directly"
    rules:
      - id: R-ARCH-001
        description: "Evidence Gates must use structured evaluation criteria"
        severity: mandatory

    # Extension properties (freely added with x- prefix)
    x-identity: |
      You act as the Architect. You NEVER implement or test directly.
      Instead you delegate to specialist sub-agents.
    x-role-selection-guide:
      - agent: implementer
        condition: "Backend code, infrastructure, database migrations"
      - agent: test-writer
        condition: "Test code creation and coverage improvement"
```

### Task Definition

```yaml
tasks:
  - id: implement-feature
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

    # Task-specific behavioral spec
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
```

### Artifact Definition

```yaml
artifacts:
  - id: spec-md
    type: document
    description: "Specification document"
    owner: main-architect
    producers: [main-architect]
    editors: [main-architect]
    consumers: [implementer, test-writer]
    states: [draft, reviewed, approved]
    required_validations: [spec-semantic-review]
    visibility: internal
```

### Merge Operators (for diffs in `extends` inheritance)

When inheriting a base definition via `extends`, entities are matched by `id` within each section, and diffs are described using merge operators.

```yaml
# Project definition (inherits base via extends)
extends: "@agent-contracts/base-team"

agents:
  # Same id exists in base → deep merge
  - id: implementer
    constraints:
      $append:
        - "Import litedbmodel only via package path"

  # id not in base → added as new
  - id: designer
    role_name: "Designer"
    purpose: "UI design"

tasks:
  - id: implement-feature
    execution_steps:
      $insert_after:
        target: run-db-lint
        items:
          - id: run-contract-pipeline
            action: "Run contract pipeline"
            uses_tool: api-pipeline
```

Merge operators:

| Operator | Behavior |
|---|---|
| `$append` | Append to end of array |
| `$prepend` | Prepend to beginning of array |
| `$insert_after` | Insert after element with specified id |
| `$replace` | Replace entire array/value |
| `$remove` | Remove element by id |
| (direct value) | Override scalar field |

### Extension Properties (`x-` prefix)

Information that cannot be expressed with the standard schema can be written as properties with the `x-` prefix (following OpenAPI conventions).

```yaml
agents:
  - id: main-architect
    # ... standard properties ...

    # Scalar (multiline text)
    x-identity: |
      You act as the Architect.

    # Array
    x-role-selection-guide:
      - agent: implementer
        condition: "Backend code, infrastructure"

    # Object
    x-cursor-config:
      subagent_type: null
      globs: ["**/*"]
```

- `x-` properties are ignored by the schema validator for type enforcement
- Same merge rules and operators as standard properties apply during `extends` inheritance
- Included in the Prompt Renderer template context

---

## CLI

### Installation

```bash
npm install -g agent-contracts    # Global
npm install -D agent-contracts    # Project-local
npx agent-contracts               # Direct execution
```

### Commands

| Command | Description |
|---|---|
| `agent-contracts resolve [dir]` | Resolve `extends` inheritance and output resolved YAML |
| `agent-contracts validate [dir]` | Schema validation + reference integrity check. Exit 1 on errors |
| `agent-contracts lint [dir]` | Run semantic lint. Display diagnostics and control exit code by severity |
| `agent-contracts render [dir]` | Generate prompt md from resolved YAML + Handlebars templates |
| `agent-contracts render [dir] --check` | Drift check. Detect diffs without writing files; exit 1 if diffs found |
| `agent-contracts check [dir]` | Run resolve → validate → lint → render --check in sequence (for CI) |

### Options for `render` / `check`

| Option | Description |
|---|---|
| `--template-dir <path>` | Handlebars template directory (required) |
| `--output-dir <path>` | Output directory (required) |

### Common Options

| Option | Description |
|---|---|
| `--format json\|text` | Specify output format |
| `--quiet` | Show errors only |
| `--strict` | Treat warnings as exit 1 |

### Usage Examples

```bash
# Output resolved YAML to stdout
agent-contracts resolve ./my-project

# Output resolved YAML to file
agent-contracts resolve ./my-project -o resolved.yaml

# Schema validation
agent-contracts validate ./my-project

# Semantic lint (JSON output)
agent-contracts lint ./my-project --format json

# Generate prompt md
agent-contracts render ./my-project --template-dir ./templates --output-dir ./rendered

# Drift check in CI
agent-contracts render ./my-project --template-dir ./templates --output-dir ./rendered --check

# Run all checks in CI
agent-contracts check ./my-project --template-dir ./templates --output-dir ./rendered --strict
```

### Multi-level Inheritance (base → team → project)

```bash
# 1. Resolve base
agent-contracts resolve ./base/ -o ./team/base-resolved.yaml

# 2. Resolve team definition (references base-resolved.yaml via extends)
agent-contracts resolve ./team/ -o ./project/team-resolved.yaml

# 3. Resolve project definition
agent-contracts resolve ./project/ -o ./resolved.yaml
```

---

## Workflow

```text
1. Define DSL in YAML
   ├── agent-contracts.yaml (entry point; references base via extends)
   └── agents.yaml, tasks.yaml, ... (for multi-file format)

2. agent-contracts resolve
   Resolve extends inheritance → id-based deep merge → generate resolved YAML

3. agent-contracts validate
   Zod schema shape validation + reference integrity check

4. agent-contracts lint
   Bidirectional consistency, coverage analysis, workflow graph completeness

5. agent-contracts render
   resolved YAML + Handlebars templates → generate agent prompts (md)

6. agent-contracts check in CI
   Run steps 2–5 in sequence to ensure design consistency and up-to-date rendered output
```

---

## Prompt Rendering

Generates one static Markdown file per agent from resolved YAML and Handlebars templates. Files are written to the directory specified by `render --output-dir`. The output serves as the system prompt or instruction document for each agent, containing its responsibilities, constraints, available tools, and delegatable tasks — all derived from the YAML definitions.

### Template Context

| Context | Contents |
|---|---|
| **global context** | Entire resolved YAML (system, agents, tasks, artifacts, etc. + extension properties) |
| **per-agent context** | Each agent + related tasks + related handoff_types + related artifacts/tools |

### Template Example

```handlebars
# {{agent.role_name}}

## Purpose

{{agent.purpose}}

## Responsibilities

{{#each mergedResponsibilities}}
- {{this}}
{{/each}}

{{#if agent.x-identity}}
## Identity

{{{agent.x-identity}}}
{{/if}}

{{#if agent.x-role-selection-guide}}
## Role Selection Guide

{{#each agent.x-role-selection-guide}}
- **{{this.agent}}**: {{this.condition}}
{{/each}}
{{/if}}
```

Templates are responsible only for **defining section structure and rendering methods**. All project-specific content is sourced from YAML (standard properties + extension properties).

---

## Validation Layers

agent-contracts separates validation into 3 layers.

### A. Schema Validation (Zod + Spectral)

- Type, required field, and enum validation
- Detection of custom properties without `x-` prefix
- Handoff payload shape validation
- Naming conventions

### B. Reference Integrity Checks

- ID reference integrity across agents / tasks / artifacts / tools / validations
- Existence check for owner, producers, editors, consumers references

### C. Semantic Lint (TypeScript custom rules)

- **Bidirectional consistency** between `can_execute_tools` and `tools.invokable_by`
- Bidirectional consistency between `allowed_from_agents` and `can_invoke_agents`
- Validation coverage analysis (e.g., whether code artifacts have mechanical validation)
- Workflow graph completeness (existence of release / audit roots)
- Design rule validation on post-merge resolved definitions

---

## Programmatic API

In addition to the CLI, a programmatic API is available for use from TypeScript.

```typescript
import { resolve, validate, lint, render } from "agent-contracts";

const resolved = await resolve("./my-project");
const validationResult = await validate(resolved);
const lintResult = await lint(resolved);
await render(resolved, { templateDir: "./templates", outputDir: "./rendered" });
```

---

## Tech Stack

| Category | Choice |
|---|---|
| Language | TypeScript 5.x (ESM, strict mode) |
| Schema | Zod |
| YAML parsing | yaml (npm) |
| Lint | Spectral (Stoplight) |
| Templates | Handlebars |
| CLI | commander |
| Testing | Vitest |
| Build | tsup |

---

## Project Structure

```text
agent-contracts/
  src/
    schema/         # Zod schema definitions
    loader/         # YAML loading and integration
    resolver/       # extends resolution + id-based deep merge
    validator/      # Schema Validation + reference integrity
    linter/         # Semantic Lint (TypeScript custom rules)
    renderer/       # Prompt Renderer (Handlebars)
    cli/            # CLI entry point + commands
  spectral/         # Spectral rulesets
  schemas/          # JSON Schema derived from Zod
  test/
    fixtures/       # Test YAML samples
```

## License

MIT
