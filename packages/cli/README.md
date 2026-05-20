# edlc

Terminal CLI for EDLC — drives Claude through pipelines you declare in
`.edlc/workspace.yaml`. Manages the workspace, executes runs end-to-end via
the `claude` CLI, and shares state with the VS Code extension over the
filesystem (no daemon, no IPC).

**Claude only.** The CLI shells out to `claude --print --append-system-prompt
<skill>`. No Anthropic SDK calls, no other model runners.

## Install

```sh
# From npm (when published)
npm install -g edlc

# From source (development)
pnpm install                                 # at repo root
cd packages/cli && npm link                  # makes `edlc` available globally
```

## Prerequisites

- **Node.js ≥ 18**
- **`claude` CLI** on PATH — install from https://github.com/anthropics/claude-code
- **Authentication** — either `ANTHROPIC_API_KEY` env var, or `claude config list` returning ok

Run `edlc doctor` to verify all of the above.

## Five-minute walkthrough

```sh
# 1. New workspace from scratch
mkdir my-pipeline && cd my-pipeline
edlc init
edlc doctor                                 # confirm claude is wired up

# 2. Drop in a built-in preset (or build manually with skill/agent/pipeline add)
edlc preset apply code-review
edlc list                                   # see the agents, skills, pipeline you got

# 3. Kick off a run and let Claude do the work
edlc run start review-pipeline --context diff=$(git diff HEAD~1)
edlc run exec <runId>                       # streams claude output, advances on success
```

## Command reference

Global flags available on every subcommand:

| Flag | Default | Purpose |
|---|---|---|
| `-w, --workspace <path>` | `cwd` | Workspace root (containing `.edlc/`). Also reads `EDLC_WORKSPACE` env. |

### `init` — bootstrap a workspace

```
edlc init [--name "Workspace Name"]
```

Creates `.edlc/workspace.yaml` (commented starter), `.edlc/skills/`, `.edlc/runs/`.
Idempotent — skips anything that already exists.

### `doctor` — health check

```
edlc doctor
```

Verifies `workspace.yaml` parses + Zod-validates, `claude` binary is on PATH,
authentication works, all skill paths exist, custom runner files exist, and
run-state JSON files are parseable. Exit 1 on any failure.

### `validate` — schema-only check

```
edlc validate
```

Stricter than the `doctor` workspace section: enumerates every Zod issue with
its `path[]` for editor jump-to-line.

### `list` — print workspace contents

```
edlc list [--json]
```

Pretty table by default, structured JSON for piping into `jq`.

---

### Skills

```
edlc skill add --id <id> --template <name>            # bundled template (5 available)
edlc skill add --id <id> --path .edlc/skills/my.md   # reference your own .md
edlc skill list [--json] [--templates]                # `--templates` lists the 5 built-ins
edlc skill show <id>                                  # prints the rendered .md content
edlc skill remove <id>                                # removes from yaml (does NOT delete .md)
```

Built-in templates: `hello-world`, `code-reviewer`, `test-converter`,
`doc-writer`, `release-notes`. Run `edlc skill list --templates` for a one-line
description of each.

### Agents

```
edlc agent add --id <id> --name <n> --skill <skillId>
                [--model claude-sonnet-4-5]
                [--capabilities files,github,jira]
                [--description "…"]
                [--runner default|custom] [--runner-path .edlc/runners/foo.js]
edlc agent list [--json]
edlc agent show <id>
edlc agent remove <id>
edlc agent run <id> [--message "…"] [--context k=v,…] [--dry-run]
```

`agent run` is one-shot — spawns `claude` with the agent's skill + your
message, streams to stdout, no run state created. Useful for quick checks and
piping into shell scripts.

### Pipelines

```
edlc pipeline add --id <id> --steps agent1,agent2,agent3
                   [--human-review]                        # mark all steps as gated
                   [--produces "p1.md:p2.md,p3.md"]        # colon between steps, comma between artifacts
                   [--on-failure stop|continue]
edlc pipeline list [--json]
edlc pipeline show <id>                                   # numbered step graph
edlc pipeline remove <id>
```

### Presets

```
edlc preset list [--json]                # shows built-ins and saved snapshots
edlc preset apply <name>                 # merges into current workspace (no overwrite)
edlc preset save <name>                  # snapshot current workspace to .edlc/presets/<name>.json
```

Built-in presets: `code-review`, `release-notes`, `sdlc` (full 9-phase SDLC
pipeline ported from the legacy EDLC).

### Epics

Mirrors the extension's "Epic Pipeline" panel — reads each epic's `state.json`
under whatever `state.root` your `workspace.yaml` declares (default
`docs/epics/`).

```
edlc epic list [--status pending|in_progress|done|failed] [--json]
edlc epic status <id> [--json]                 # phase-by-phase view
edlc epic show <id>                            # alias for status
```

In v2 an **epic** is a domain entity persisted on disk (one folder per epic
with a `state.json`); it's distinct from a pipeline **run**. An epic can exist
without a run, and a run can exist without an epic — `epic` reads the former,
`run` / `status` read the latter.

---

### `run` — pipeline lifecycle

These wrap `@edlc/core`'s `PipelineRunner` and write atomically through
`RunStateStore`. The VS Code sidebar updates within ~200ms.

```
edlc run start <pipelineId> [--id <runId>] [--context k=v,k=v]
edlc run mark-done <runId>             # validates produces paths, advances or awaits review
edlc run approve   <runId> [--comment "…"]
edlc run reject    <runId> --reason "…"
edlc run rerun     <runId> [--feedback "…"]
edlc run delete    <runId> [--force]
edlc run open      <runId> [--path]    # prints state.json content (or just file path)
edlc run exec      <runId> [--until <step>] [--auto-approve] [--message "…"] [--dry-run]
```

**`run exec`** is the unique unlock: it spawns `claude` for the current step,
streams stdout to your terminal, validates the produced artifacts, and advances
to the next step automatically. With `--auto-approve` it also clears
`human_review` gates without pausing — a single command then drives the entire
pipeline end-to-end.

`run start` defaults `runId` to `<pipelineId>-<timestamp>` if `--id` is omitted.

### `step` — direct step control

The `run` commands operate on the current step. `step` operates on **any**
step regardless of pipeline order, for when reality doesn't match the
pipeline (work done outside the tool, phases that don't apply this time,
hopping back to redo something).

```
edlc step start  <runId> <step>          # → awaiting_work, moves pointer (demotes the old current step to pending)
edlc step done   <runId> <step> [--reason "…"]   # → approved (no produces validation)
edlc step skip   <runId> <step>          # → approved with skip note
edlc step reset  <runId> <step>          # → pending (no cascade)
edlc step set    <runId> <step> <status> # raw — any of: pending | awaiting_work | awaiting_review | approved | rejected
edlc step jump   <runId> <step>          # moves pointer + auto-approves earlier pending steps
```

`<step>` accepts a 0-based index (`0`, `1`, `2`) or an agent id (`reviewer`,
`planner`) — whichever is easier in context.

`step done` and `step skip` only advance the pointer when the step they touch
is the **current** step; touching an earlier step won't drag the pointer
backward.

### `status` — list runs / inspect one

```
edlc status                              # all runs in .edlc/runs/
edlc status <runId>                      # detailed view of one run
edlc status [runId] --json               # raw RunState JSON
```

### `watch` — live re-render of run state

Uses `chokidar` on `.edlc/runs/*.json` with a 150ms debounce. Clears the
visible terminal area on every redraw (preserves scrollback so you can scroll
up to past frames).

```
edlc watch                               # multi-run table, all runs
edlc watch <runId>                       # single-run focus mode (step pipeline)
```

### `tail` — stream state transitions

Same chokidar watch as `watch`, but emits one timestamped line per detected
change instead of redrawing a table. Useful for CI logs or piping.

```
edlc tail                                # all runs
edlc tail <runId>                        # one run
```

Output shape:

```
[16:42:01] ABC-123 step 0 awaiting_work → approved
[16:42:01] ABC-123 pointer 0 → 1
[16:42:01] ABC-123 step 1 pending → awaiting_work
```

### `dashboard` — browser UI with action buttons

Single-process HTTP server, no build step. Same data as `watch`; adds
click-to-approve / reject / rerun buttons. Updates push via SSE so the page
refreshes within ~100ms when files change.

```
edlc dashboard                           # http://127.0.0.1:8787
edlc dashboard --port 3000
edlc dashboard --host 0.0.0.0            # expose on LAN (use with care)
```

Endpoints (handy for scripts): `GET /api/runs`, `GET /api/runs/:id`,
`POST /api/action`, `GET /events` (SSE).

## Recipes

### Drive a complete SDLC pipeline end-to-end

```sh
edlc preset apply sdlc
edlc run start sdlc-pipeline --id ABC-123 --context epic=ABC-123
edlc run exec ABC-123 --auto-approve     # claude works through every phase
```

### Manually mark a phase done that you completed outside EDLC

```sh
edlc step done <runId> implement --reason "merged via PR #42"
edlc run exec <runId>                    # resumes from the next step
```

### Restart a single phase without cascading

```sh
edlc step reset <runId> review
edlc step start <runId> review            # → awaiting_work
edlc run exec <runId>
```

### One-shot ask, no run state

```sh
edlc agent run reviewer --message "Review the diff in /tmp/patch.diff"
```

### Pipe runs into another tool

```sh
edlc list --json | jq '.pipelines[].id'
edlc status <runId> --json | jq '.steps[] | select(.status=="rejected")'
edlc epic list --json | jq '.[] | select(.status=="in_progress") | .id'
```

### Live monitor while a long pipeline runs

```sh
# Terminal 1 — kick off the run, then walk away
edlc run start sdlc-pipeline --id ABC-123 --context epic=ABC-123
edlc run exec ABC-123 --auto-approve

# Terminal 2 — live table
edlc watch

# Terminal 3 — transition log for grep / save
edlc tail | tee run-log.txt
```

### Open the browser dashboard

```sh
edlc dashboard
# then open http://127.0.0.1:8787
# click any run → approve / reject / rerun directly from the page
```

## Filesystem layout

The CLI never holds in-memory state — everything lives in your workspace:

```
my-project/
├── .edlc/
│   ├── workspace.yaml          # agents, skills, pipelines (Zod validated)
│   ├── skills/                 # custom skill .md files
│   │   └── code-reviewer.md
│   ├── runs/                   # one JSON per run
│   │   └── ABC-123.json        # full RunState (steps, status, context)
│   └── presets/                # saved workspace snapshots
│       └── my-preset.json
└── docs/                       # produces paths from your pipelines land here
    └── …
```

Runs and presets are local-only — gitignore `.edlc/runs/` and
`.edlc/presets/` if you want, the rest is meant to be committed.

## Troubleshooting

| Problem | Likely fix |
|---|---|
| `edlc doctor` says "Not authenticated" | `claude login` (Claude Code) or set `ANTHROPIC_API_KEY` |
| `edlc run exec` fails with "missing artifacts" | The agent didn't produce the files declared in `pipeline.steps[].produces`. Check the paths or fix the agent's skill. |
| `edlc run start` rejects the runId | RunIds must match `^[A-Za-z0-9][A-Za-z0-9._-]*$`. No spaces, no leading dashes. |
| Pipeline step appears as a string in YAML, but I edited it as an object | Both forms are valid. The CLI writes string form when there's no metadata, object form when there's `human_review` or `produces`. |
| Custom runner not loading | `runner_path` must be `.js` / `.cjs` / `.mjs` (no TypeScript yet). Run `edlc doctor` to check the file resolves. |

## License

MIT
