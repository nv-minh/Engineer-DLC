import * as fs from 'fs';
import * as path from 'path';
import { Command } from 'commander';
import chalk from 'chalk';
import { resolveWorkspaceRoot } from '../workspaceRoot';

const EDLC_DIR      = '.edlc';
const WORKSPACE_FILE = 'workspace.yaml';
const SKILLS_DIR     = 'skills';
const RUNS_DIR       = 'runs';

const STARTER_WORKSPACE = `version: "1.0"
name: "My EDLC Workspace"

# Skills are system prompts for your Claude agents.
# Add a builtin skill (bundled) or point to your own .md file.
skills: []
#   - id: code-reviewer
#     builtin: true
#   - id: my-skill
#     path: ./.edlc/skills/my-skill.md

# Agents are Claude instances wired to a skill.
agents: []
#   - id: reviewer
#     name: "Code Reviewer"
#     skill: code-reviewer
#     model: claude-sonnet-4-5
#     capabilities: [files, github]

# Pipelines chain agents into ordered steps.
pipelines: []
#   - id: review-pipeline
#     steps:
#       - agent: reviewer
#         produces: ["docs/review-{epic}.md"]
#         human_review: true

# Optional: declare a context entity that persists state across runs.
# state:
#   entity: epic
#   root: docs/epics
#   status_file: .state.json
`;

function check(label: string, pass: boolean, info?: string): void {
  const icon = pass ? chalk.green('✔') : chalk.yellow('ℹ');
  const detail = info ? chalk.dim(`  ${info}`) : '';
  console.log(`  ${icon}  ${label}${detail}`);
}

export function registerInit(program: Command): void {
  program
    .command('init')
    .description('Scaffold .edlc/ workspace for a new project')
    .option('--name <name>', 'workspace name (written into workspace.yaml)', 'My EDLC Workspace')
    .action(async (opts: { name: string }, cmd: Command) => {
      const root    = resolveWorkspaceRoot(cmd);
      const edlcDir = path.join(root, EDLC_DIR);
      const wsPath   = path.join(edlcDir, WORKSPACE_FILE);
      const skillsDir = path.join(edlcDir, SKILLS_DIR);
      const runsDir   = path.join(edlcDir, RUNS_DIR);

      console.log(chalk.bold('\nedlc init'));
      console.log(chalk.dim(`workspace: ${root}\n`));

      // workspace.yaml
      if (fs.existsSync(wsPath)) {
        check(`${EDLC_DIR}/${WORKSPACE_FILE}`, true, 'already exists — skipped');
      } else {
        fs.mkdirSync(edlcDir, { recursive: true });
        const content = STARTER_WORKSPACE.replace(
          '"My EDLC Workspace"',
          JSON.stringify(opts.name),
        );
        fs.writeFileSync(wsPath, content, 'utf8');
        check(`${EDLC_DIR}/${WORKSPACE_FILE}`, true, 'created');
      }

      // .edlc/skills/
      if (!fs.existsSync(skillsDir)) {
        fs.mkdirSync(skillsDir, { recursive: true });
        check(`${EDLC_DIR}/${SKILLS_DIR}/`, true, 'created');
      } else {
        check(`${EDLC_DIR}/${SKILLS_DIR}/`, true, 'already exists — skipped');
      }

      // .edlc/runs/
      if (!fs.existsSync(runsDir)) {
        fs.mkdirSync(runsDir, { recursive: true });
        check(`${EDLC_DIR}/${RUNS_DIR}/`, true, 'created');
      } else {
        check(`${EDLC_DIR}/${RUNS_DIR}/`, true, 'already exists — skipped');
      }

      console.log();
      console.log(chalk.green('✔') + ' Done. Next steps:');
      console.log(chalk.dim(`  1. Edit ${chalk.white(`.edlc/${WORKSPACE_FILE}`)} to add agents, skills, and pipelines`));
      console.log(chalk.dim(`  2. Run ${chalk.cyan('edlc validate')} to check the schema`));
      console.log(chalk.dim(`  3. Run ${chalk.cyan('edlc doctor')} to verify the Claude binary and env`));
      console.log(chalk.dim(`  4. Run ${chalk.cyan('edlc agent add')} to add your first agent (M2)\n`));
    });
}
