---
name: em-team
description: EM-Team Fullstack Engineering System — 82 skills, 35 agents, 24 workflows for fullstack development
version: 3.2.0
---

# EM-Team — Fullstack Engineering System

EM-Team is integrated into this project as a vendored submodule at `vendor/em-team/`.

## What's Available

- **82 Skills** — Reusable patterns for TDD, debugging, architecture, security, and more
- **35 Agents** — Specialized AI assistants (planner, code-reviewer, debugger, architect, etc.)
- **24 Workflows** — End-to-end processes (new-feature, bug-fix, security-audit, etc.)

## How to Use

Invoke EM-Team via `em:` prefixed slash commands:

```
/em:new-feature     — Take an idea to production
/em:bug-fix         — Systematic bug resolution
/em:code-review     — 5-axis code review
/em:architect       — Architecture & technical design
/em:planner         — Create implementation plans
/em:ship            — Ship workflow (test → PR)
```

## Key Agents

| Agent | Purpose |
|---|---|
| planner | Create detailed implementation plans |
| executor | Execute with atomic commits |
| code-reviewer | 5-axis / 9-axis code review |
| debugger | Systematic debugging |
| architect | Architecture & technical design |
| test-engineer | Test strategy & generation |
| security-reviewer | OWASP security review |
| frontend-expert | React/Next.js, UI/UX |
| backend-expert | API, database, performance |

## Skill Categories

- **Foundation**: brainstorming, spec-driven-development, writing-plans, context-engineering
- **Development**: TDD, incremental-implementation, subagent-driven-development
- **Expert Groups**: React, Vue, Go, NestJS, Python, Database, DevOps, Mobile, Spring, Rust, TypeScript
- **Quality**: code-review, security-audit, e2e-testing, performance-optimization
- **Workflow**: git-workflow, ci-cd-automation, documentation

## Full Catalog

See `vendor/em-team/skills/SKILL-INDEX.md` for the complete skill/agent/workflow catalog.

## Updating EM-Team

```bash
git submodule update --remote vendor/em-team
```
