# EDLC

Drive Claude through any pipeline you declare in a single `workspace.yaml` — visually from VS Code, or from the terminal. Agents, skills, pipelines, and epics share one source of truth; both surfaces stay in sync within ~200ms.

![edlc demo](https://raw.githubusercontent.com/nv-minh/edlc/v0.8.5/packages/extension/media/demo.gif)

## Features

- **Workspace Builder** — main-area panel with agent / skill / pipeline cards, reorder, on-failure toggle, inline skill editor
- **Epics & runs** — bind a pipeline to a work item, then walk it step-by-step. **Approve** advances; **reject** cascades feedback to the producing step (auto-resets downstream); **rerun** with optional new context
- **Sidebar webview** — live agent / skill / pipeline counts, active runs, and the slash commands declared in `workspace.yaml`
- **Load Demo Project** — one click drops a full SDLC pipeline + 6 sample epics into `.edlc/`, no YAML to write
- **Add Skill wizard** — 4 sources: load template, paste markdown, upload a `.md` file, or open a blank file. Starter templates: hello-world, code-reviewer, test-converter, doc-writer, release-notes
- **Add Agent wizard** — id, display name, skill picker, model picker (Sonnet 4.6 / Opus 4.7 / Haiku 4.5)
- **Add Pipeline wizard** — chain agents with on-failure behavior (stop / continue)
- **Workspace templates** — save the whole workspace as a named preset and reapply it in any project. Built-ins: `code-review`, `release-notes`, `sdlc`
- **Built-in Claude CLI terminal** — one-click zsh terminal in the bottom panel with the `claude` CLI auto-launched
- **Workspace inspector** — dump the parsed, validated, env-resolved `workspace.yaml` to the output channel
- **Interactive walkthrough** — open the Welcome page → "Get started with EDLC" for a 6-step tour

## How It Works

The extension reads `.edlc/workspace.yaml` from the open folder and uses [`@edlc/core`](../core) to validate the schema (Zod), resolve env variables, load skills and agents, and execute pipelines through the Claude CLI runner.

```
.edlc/
├── workspace.yaml          # agents · skills · pipelines · sidebar layout
├── skills/                 # markdown prompts for each skill
├── epics/                  # work items bound to a pipeline
└── runs/                   # state of every run, watched live by both UIs
```

Both the extension and the `edlc` CLI read and write the same files atomically — switch between them mid-run without losing state.

## Getting Started

1. Install **EDLC** from the VS Code Marketplace or Open VSX.
2. Open a workspace folder.
3. The Welcome page auto-opens the **Get started with EDLC** walkthrough — follow it for a guided tour, or skip ahead with the steps below.
4. Run **EDLC: Load Demo Project** — scaffolds a full pipeline plus 6 sample epics under `.edlc/`.
5. Click the **EDLC** icon in the activity bar to open the sidebar; pick an epic to run.
6. Use **EDLC: Open Claude CLI Terminal** to drive runs (or run pipelines unattended) from the CLI.

Prefer to start from scratch? Use **EDLC: Init Sample Workspace** instead — it scaffolds an empty `.edlc/workspace.yaml` plus a `hello-skill.md`.

## Commands

All commands are available via `Cmd+Shift+P` (or `Ctrl+Shift+P`):

| Command | Description |
|---------|-------------|
| `EDLC: Load Demo Project (full pipeline + 6 epics)` | Drop a complete demo workspace into the open folder |
| `EDLC: Open Workspace Builder` | Visual builder for agents, skills, and pipelines |
| `EDLC: Init Sample Workspace` | Scaffold an empty `.edlc/workspace.yaml` + sample skill |
| `EDLC: Show Workspace Config` | Dump parsed workspace.yaml to the EDLC output channel |
| `EDLC: Add Skill (template / paste / upload / blank)` | Add a new skill from one of four sources |
| `EDLC: Add Agent` | Wizard to add a new agent (skill + model) |
| `EDLC: Add Pipeline (chain agents)` | Wizard to chain agents into a pipeline |
| `EDLC: Save Workspace as Template` | Save the current workspace as a reusable preset |
| `EDLC: Load Template` | Apply a saved preset to the open workspace |
| `EDLC: Delete Saved Template` | Remove a saved preset |
| `EDLC: Open Claude CLI Terminal` | Open a zsh terminal with `claude` auto-launched |
| `EDLC: Start Epic` | Begin a new epic from the sidebar |
| `EDLC: Open Epics List` | Browse epics in the open workspace |
| `EDLC: Insert Demo Epic (EPIC-100)` | Drop a single demo epic for quick exploration |

## Requirements

- VS Code 1.85.0+ (or compatible: VSCodium, Cursor, Windsurf)
- A workspace folder (single-file mode is not supported)
- The Claude CLI on `PATH` for the default runner
- Node.js 20+ to compile from source

## License

MIT
