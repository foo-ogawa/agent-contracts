# Multi-Team Example

This example demonstrates both **multi-team DSL features** (`team_interface`, `imports`, `team_task`) and **multi-team configuration** (`teams`, `_defaults`).

## Files

- `config.yaml` — Multi-team configuration with `_defaults` and per-team DSL paths
- `backend-team.yaml` — Backend team DSL with a `team_interface` section
- `qa-consumer.yaml` — QA team DSL that imports the backend team's interface

## Usage

1. Generate the backend team's public interface:

```bash
agent-contracts generate interface -c config.yaml --team backend
```

2. Validate all teams:

```bash
agent-contracts validate -c config.yaml
```

3. Run full checks (including cross-team import verification):

```bash
agent-contracts check -c config.yaml
```

## How it works

1. The **backend team** declares a `team_interface` with accepted workflows and exposed artifacts
2. `generate interface --team backend` produces `backend-team-interface.yaml` containing only the public surface
3. The **QA team** imports the backend interface and uses `team_task` steps to delegate work
4. `check` verifies that all imported interface files exist on disk
