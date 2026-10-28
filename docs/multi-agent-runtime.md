# Multi-agent runtime guide

This repository has three related but separate capabilities:

- **Sub-agents**: the `Agent` tool runs a focused worker with its own context.
- **Agent Teams**: a leader coordinates named teammates that can message each other and share a task list.
- **Coordinator Mode**: the main loop becomes an orchestration-only coordinator that delegates tasks to background `worker` agents.

## Build the experimental features

From the repository root:

```powershell
bun run build:dev:full
```

The development binary is `./cli-dev` (PowerShell: `.\cli-dev`).

## Test Agent Teams

External builds require Agent Teams to be opted into. Use either the environment variable or the `--agent-teams` CLI flag. The GrowthBook kill switch `tengu_amber_flint` can still disable this experimental feature.

```powershell
$env:CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = "1"
.\cli-dev
```

Then ask the model to create a small team with two teammates assigned distinct, read-only investigations, message them if needed, and summarize both results. Check that the team and active tasks are visible in the UI. To test cleanup, ask the model to shut down the teammates and clean up the team.

## Test Coordinator Mode

Coordinator Mode is a separate experimental runtime mode. It requires the `COORDINATOR_MODE` build feature and `CLAUDE_CODE_COORDINATOR_MODE=1`. It also uses `SendMessage` to continue or steer background agents; on external builds, opt into Agent Teams as above so that tool is enabled.

```powershell
$env:CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = "1"
$env:CLAUDE_CODE_COORDINATOR_MODE = "1"
.\cli-dev
```

Start a **new session** after setting these variables. Ask for two independent research tasks and tell the coordinator to delegate them in parallel, wait for each result, and synthesize the findings. The coordinator should use the `Agent` tool with `subagent_type: "worker"`; it should not perform file edits directly. Worker tools are assembled separately, so the coordinator's restricted tool list does not restrict the workers.

## Troubleshooting

- If Agent Teams tools are missing, confirm the opt-in variable or `--agent-teams` flag is present and that the GrowthBook kill switch is not disabled.
- If the coordinator behaves like a normal assistant, confirm the binary was rebuilt with `bun run build:dev:full`, `CLAUDE_CODE_COORDINATOR_MODE=1` was set **before starting it**, and you opened a new session.
- A successful spawn is not proof that every worker completed correctly. Check each task's final status and result; report any failed or unverified worker rather than treating it as success.

These modes remain experimental. This guide describes runtime setup; it does not claim that an end-to-end multi-agent run has been executed by CI or in every supported terminal environment.
