# Multi-Team Example

This example demonstrates the multi-team collaboration features of agent-contracts.

## Files

- `backend-team.yaml` — Backend team DSL with a `team_interface` section
- `qa-consumer.yaml` — QA team DSL that imports the backend team's interface

## Usage

Generate the backend team's public interface:

```bash
agent-contracts generate interface -c backend-config.yaml
```

The QA team references the generated interface in its `imports` section.

## How it works

1. The **backend team** declares a `team_interface` with accepted workflows and exposed artifacts
2. `generate interface` produces a `team-interface.yaml` containing only the public surface
3. The **QA team** imports the backend interface and uses `team_task` steps to delegate work
