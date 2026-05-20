# Engineer-DLC

AI-driven SDLC + agent workflow runner — drives Claude through any pipeline you
declare in `.edlc/workspace.yaml`. Use it through the VS Code Builder UI or
straight from the terminal.

Integrates [EM-Team](https://github.com/nv-minh/Engineer-team) — a fullstack
engineering system with 82 skills, 35 agents, and 24 workflows.

This is a **monorepo** managed with [pnpm workspaces](https://pnpm.io/workspaces).

## Packages

| Package | Path | Purpose |
|---|---|---|
| [`edlc`](packages/extension/) (extension) | `packages/extension/` | VS Code extension. Builder UI for `workspace.yaml`, sidebar for active runs, run-state commands. |
| [`@edlc/core`](packages/core/) | `packages/core/` | Pure-TypeScript engine: Zod schema, workspace loader, runner registry (`DefaultRunner` shells out to `claude`), pipeline state machine. **No `import 'vscode'`** — runs identically in CLI / tests / cloud. |
| [`edlc`](packages/cli/) (CLI) | `packages/cli/` | Standalone terminal CLI. Manages `workspace.yaml`, drives runs end-to-end via Claude, no VS Code required. See [packages/cli/README.md](packages/cli/README.md). |

## Quick start

### Prerequisites

- **Node.js** >= 20.19 (for Vite 7)
- **pnpm** >= 10
- **Claude Code CLI** installed and authenticated

### 1. Clone & setup

```sh
git clone https://github.com/nv-minh/Engineer-DLC.git
cd Engineer-DLC

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Setup EM-Team symlink (~/.claude/em-team/ -> vendor/em-team/)
bash scripts/setup-em-team.sh
```

### 2. Run the VS Code extension

```sh
# Open in VS Code
code .

# Press F5 to launch Extension Development Host
# Or run directly:
code --extensionDevelopmentPath=packages/extension .
```

### 3. Use the CLI

```sh
edlc init                              # scaffolds .edlc/workspace.yaml
edlc preset apply code-review          # or: sdlc, release-notes
edlc validate                          # check schema
edlc doctor                            # verify claude binary + auth
```

### 4. Start a run

```sh
edlc run start review-pipeline --context epic=ABC-123
edlc run exec <runId>                  # spawns claude, streams output
```

## EM-Team Integration

This project includes EM-Team as a vendored git submodule at `vendor/em-team/`.

### Available via `em:` prefix

| Category | Count | Examples |
|---|---|---|
| Skills | 82 | brainstorming, TDD, code-review, security-audit |
| Agents | 35 | planner, architect, debugger, code-reviewer |
| Workflows | 24 | new-feature, bug-fix, security-audit, team-review |

### Key commands

```
/em:new-feature     — idea to production
/em:bug-fix         — systematic bug resolution
/em:code-review     — 5-axis code review
/em:architect       — architecture & technical design
/em:ship            — ship workflow (test → PR)
```

### Update EM-Team

```sh
git submodule update --remote vendor/em-team
```

Full catalog: `vendor/em-team/skills/SKILL-INDEX.md`

## Repo dev

```sh
pnpm install                            # installs all packages + creates symlinks
pnpm build                              # tsc -r in every package
pnpm test                               # @edlc/core unit tests
pnpm package:extension                  # build .vsix for the extension
```

## CLI reference (summary)

The full reference lives in [packages/cli/README.md](packages/cli/README.md).

### Workspace bootstrap
```
edlc init                    # scaffold .edlc/workspace.yaml + skills/ + runs/
edlc validate                # parse + Zod-validate workspace.yaml
edlc doctor                  # workspace + claude binary + auth + env health checks
edlc list [--json]           # print agents, skills, pipelines
```

### Dynamic config
```
edlc skill    add | list | show | remove
edlc agent    add | list | show | remove
edlc pipeline add | list | show | remove
edlc preset   apply | save | list
```

### Run lifecycle
```
edlc run start <pipeline> [--id …] [--context epic=ABC-123]
edlc run exec   <runId> [--until …] [--auto-approve] [--dry-run]
edlc run approve <runId> [--comment …]
edlc run reject  <runId> --reason …
edlc run rerun   <runId> [--feedback …]
```

### Live observation
```
edlc watch [runId]           # cli-table3 view, redraws on state change
edlc tail  [runId]           # streams transitions as one-line events
edlc dashboard [--port …]    # browser UI with action buttons
```

## Architecture

```
                          ┌────────────────────┐
                          │  workspace.yaml    │  ← single source of truth
                          │  (Zod validated)   │
                          └──────────┬─────────┘
                                     │
                  ┌──────────────────┼──────────────────┐
                  │                  │                  │
            ┌─────▼─────┐      ┌─────▼─────┐      ┌─────▼─────┐
            │  CLI      │      │ Extension │      │ EM-Team   │
            │  (Node)   │      │  (VS Code)│      │ (vendored)│
            └─────┬─────┘      └─────┬─────┘      └───────────┘
                  │                  │
                  └────────┬─────────┘
                           │
                    ┌──────▼──────┐
                    │ @edlc/core │  ← shared engine
                    │   (no UI)   │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │ DefaultRunner│ → spawns `claude --print --append-system-prompt …`
                    └─────────────┘
```

## License

MIT
