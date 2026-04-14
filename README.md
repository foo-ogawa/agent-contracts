# agent-contracts

A declarative YAML DSL toolkit for defining, validating, and rendering multi-agent development workflows.

## Overview

`agent-contracts` provides a structured way to define agent teams — their roles, permissions, tasks, artifacts, tools, validations, handoff protocols, and workflows — in a single YAML file. It then validates the contracts for consistency and can render them into Markdown prompts via Handlebars templates.

### Key Features

- **Schema validation** — Zod-based schema enforcement with `x-` extension support
- **Reference integrity** — cross-entity reference checking (agents ↔ artifacts ↔ tools ↔ tasks ↔ handoff types)
- **Semantic linting** — built-in TypeScript rules + Spectral-based rules for deeper validation
- **Template rendering** — Handlebars-based rendering of agent prompts, system overviews, and more
- **Inheritance** — `extends` keyword for composing base definitions with merge operators (`$append`, `$prepend`, `$insert_after`, `$replace`, `$remove`)
- **Drift detection** — check if rendered output is up to date with DSL changes

## Installation

```bash
npm install agent-contracts
```

Or use it directly via npx:

```bash
npx agent-contracts validate
```

## Quick Start

### 1. Create a DSL file

Create `agent-contracts.yaml`:

```yaml
version: 1
system:
  id: my-team
  name: My Agent Team
  default_phase_order:
    - design
    - implement

agents:
  architect:
    role_name: Architect
    purpose: Design system architecture and delegate tasks
    dispatch_only: true
    can_read_artifacts: [spec-doc]
    can_write_artifacts: [spec-doc]
    can_invoke_agents: [implementer]
    can_return_handoffs: [task-delegation]

  implementer:
    role_name: Implementer
    purpose: Implement features based on specifications
    can_read_artifacts: [spec-doc, codebase]
    can_write_artifacts: [codebase]
    can_return_handoffs: [implementation-result]

tasks:
  implement-feature:
    description: Implement a feature based on specification
    target_agent: implementer
    allowed_from_agents: [architect]
    phase: implement
    input_artifacts: [spec-doc, codebase]
    invocation_handoff: task-delegation
    result_handoff: implementation-result

artifacts:
  spec-doc:
    type: document
    owner: architect
    producers: [architect]
    editors: [architect]
    consumers: [implementer]
    states: [draft, approved]
  codebase:
    type: code
    owner: implementer
    producers: [implementer]
    editors: [implementer]
    consumers: [architect]
    states: [in-progress, complete]

tools: {}
validations: {}

handoff_types:
  task-delegation:
    version: 1
    payload:
      type: object
      required: [objective]
      properties:
        objective: { type: string }
  implementation-result:
    version: 1
    payload:
      type: object
      required: [summary]
      properties:
        summary: { type: string }

workflow: {}
policies: {}
```

### 2. Validate

```bash
agent-contracts validate
```

### 3. Lint

```bash
agent-contracts lint
```

## CLI Commands

| Command     | Description |
|-------------|-------------|
| `resolve`   | Load and merge DSL files (resolves `extends`), output as YAML or JSON |
| `validate`  | Validate DSL against schema and check cross-references |
| `lint`      | Run semantic lint rules (TypeScript + Spectral) |
| `render`    | Render DSL to files using Handlebars templates (requires config) |
| `check`     | Run full pipeline: resolve → validate → lint → render --check |

### Common Options

| Option | Description |
|--------|-------------|
| `-c, --config <path>` | Path to `agent-contracts.config.yaml` |
| `--format <text\|json>` | Output format (default: text) |
| `--quiet` | Suppress output on success |
| `--strict` | Treat warnings as errors (lint/check) |

## Config File

Create `agent-contracts.config.yaml` to configure rendering:

```yaml
dsl: ./agent-contracts.yaml

renders:
  - template: ./templates/agent-prompt.md.hbs
    context: agent
    output: ./output/{agent.id}.md

  - template: ./templates/overview.md.hbs
    context: system
    output: ./output/overview.md
```

### Context Types

Templates can be rendered per-entity or for the whole system:

| Context | Iterates Over | Template Variables |
|---------|---------------|-------------------|
| `agent` | Each agent | `agent`, `receivableTasks`, `delegatableTasks`, `relatedArtifacts`, `relatedTools`, `relatedHandoffTypes`, `mergedBehavior`, `dsl` |
| `task` | Each task | `task`, `targetAgent`, `dsl` |
| `artifact` | Each artifact | `artifact`, `dsl` |
| `tool` | Each tool | `tool`, `dsl` |
| `validation` | Each validation | `validation`, `dsl` |
| `handoff_type` | Each handoff type | `handoff_type`, `relatedTasks`, `dsl` |
| `workflow` | Each workflow phase | `workflow`, `dsl` |
| `policy` | Each policy | `policy`, `dsl` |
| `system` | Once (whole system) | `system`, `dsl` |

## DSL Reference

### Top-Level Structure

```yaml
version: 1                    # Must be 1
extends: ./base/              # Optional: inherit from base DSL
system:
  id: string
  name: string
  default_phase_order: [string]
agents: { ... }
tasks: { ... }
artifacts: { ... }
tools: { ... }
validations: { ... }
handoff_types: { ... }
workflow: { ... }
policies: { ... }
```

### Extension Properties

All entity schemas support `x-` prefixed custom properties:

```yaml
agents:
  architect:
    role_name: Architect
    purpose: Design architecture
    x-identity: "You are a senior software architect..."
    x-sections:
      - title: Guidelines
        content: |
          Follow these guidelines...
```

### Merge Operators

When using `extends`, merge operators control how child entities combine with the base:

| Operator | Description |
|----------|-------------|
| `$append` | Add entries after existing ones |
| `$prepend` | Add entries before existing ones |
| `$insert_after` | Insert entries after a specific key/ID |
| `$replace` | Replace the entire value |
| `$remove` | Remove entries by key/ID |

## Programmatic API

```typescript
import {
  loadDsl,
  resolve,
  validateSchema,
  checkReferences,
  lint,
  spectralLint,
  renderFromConfig,
  loadConfig,
} from "agent-contracts";
```

## Development

```bash
npm install
npm run build        # Build with tsup
npm run test         # Run all tests
npm run lint         # ESLint
npm run typecheck    # TypeScript type checking
```

## License

MIT
