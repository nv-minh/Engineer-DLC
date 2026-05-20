/**
 * Workspace commands exposed by the extension host:
 *   edlc.showWorkspaceConfig — load .edlc/workspace.yaml + dump parsed config
 *                               to the Output channel.
 *   edlc.initWorkspace       — scaffold a starter workspace.yaml + sample
 *                               skill so the user has something to load.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { setTimeout } from 'timers';

import {
  WorkspaceLoader,
  WorkspaceNotFoundError,
  WorkspaceParseError,
  WorkspaceValidationError,
  WORKSPACE_DIR,
  WORKSPACE_FILENAME,
  stepAgentId,
} from '@edlc/core';

import {
  addSkillCommand,
  addAgentCommand,
  addPipelineCommand,
} from './wizards';
import { WorkspaceWebview } from './workspaceWebview';
import { PresetStore } from './presetStore';
import {
  savePresetCommand,
  savePresetInlineCommand,
  applyPresetCommand,
  deletePresetCommand,
} from './presetWizards';
import { loadAllBuiltinPresets, BUILTIN_WORKFLOWS } from './builtinPresets';
import { installWorkflowGlobalsCommand } from './installWorkflowGlobalsCommand';
import { uninstallWorkflowGlobalsCommand } from './uninstallWorkflowGlobalsCommand';
import { startEpicCommand } from './epicWizard';
import { insertDemoEpicCommand } from './demoEpic';
import { loadDemoProjectCommand } from './demoProject';
import { migrateEpicStateFiles } from './epicsList';
import {
  startPipelineRunCommand,
  markStepDoneCommand,
  approveStepCommand,
  rejectStepCommand,
  rerunStepCommand,
  runAutoReviewCommand,
  openRunStateCommand,
  deleteRunCommand,
} from './runCommands';

/**
 * Sentinel `workflowId` value that `edlc.initWorkspace` accepts to mean
 * "scaffold an empty workspace, no preset". Used by the webview's
 * InitWorkflowModal — it sends this when the user picks the Empty option,
 * so the host knows to skip the native QuickPick (since the React modal
 * already collected the choice).
 */
const EMPTY_WORKSPACE_SENTINEL = '__empty__';

/**
 * Build the starter workspace.yaml. Minimal scaffold — no placeholder agents
 * or skills. The 8 built-in workflows are auto-injected into the panel from
 * the extension's bundled presets; the user applies whichever fits their
 * stack, or adds their own via the wizards.
 */
function sampleWorkspaceYaml(workspaceName: string): string {
  // Quote the name to handle spaces, dashes, and unicode safely. js-yaml
  // would handle this on round-trip but we hand-write the template here.
  const escapedName = workspaceName.replace(/"/g, '\\"');
  return `version: "1.0"
name: "${escapedName}"

agents: []

skills: []

environment: {}

slash_commands: []

sidebar:
  views:
    - type: agents-list
    - type: skills-list
`;
}

export function registerV2WorkspaceCommands(
  context: vscode.ExtensionContext,
  output: vscode.OutputChannel,
): { disposables: vscode.Disposable[]; presetStore: PresetStore } {
  const showCmd = vscode.commands.registerCommand(
    'edlc.showWorkspaceConfig',
    () => showWorkspaceConfig(output),
  );

  const initCmd = vscode.commands.registerCommand(
    'edlc.initWorkspace',
    (workflowId?: unknown) =>
      initWorkspace(output, context, typeof workflowId === 'string' ? workflowId : undefined),
  );

  const openGettingStartedCmd = vscode.commands.registerCommand(
    'edlc.openGettingStarted',
    () => openGettingStartedGuide(context),
  );

  const addSkillCmd = vscode.commands.registerCommand(
    'edlc.addSkill',
    () => addSkillCommand(),
  );

  const addAgentCmd = vscode.commands.registerCommand(
    'edlc.addAgent',
    () => addAgentCommand(),
  );

  const addPipelineCmd = vscode.commands.registerCommand(
    'edlc.addPipeline',
    () => addPipelineCommand(),
  );

  const openBuilderCmd = vscode.commands.registerCommand(
    'edlc.openBuilder',
    () => WorkspaceWebview.show(context.extensionUri, 'builder'),
  );

  // Preset library — single store instance shared across all preset commands
  // and the Builder panel. User templates live in `<project>/.edlc/templates/`
  // (project-scoped, committable). Built-ins are loaded from the extension.
  const presetStore = new PresetStore();
  presetStore.setBuiltinLoader(() => loadAllBuiltinPresets(context.extensionPath));

  const savePresetCmd = vscode.commands.registerCommand(
    'edlc.savePreset',
    () => savePresetCommand(presetStore),
  );

  const savePresetInlineCmd = vscode.commands.registerCommand(
    'edlc.savePresetInline',
    (draft?: unknown) => {
      if (!draft || typeof draft !== 'object') { return; }
      const d = draft as Record<string, unknown>;
      void savePresetInlineCommand(presetStore, {
        id: typeof d.id === 'string' ? d.id : '',
        name: typeof d.name === 'string' ? d.name : '',
        description: typeof d.description === 'string' ? d.description : '',
      });
    },
  );

  const applyPresetCmd = vscode.commands.registerCommand(
    'edlc.applyPreset',
    (presetId?: unknown, skipConfirm?: unknown) =>
      applyPresetCommand(
        presetStore,
        context.extensionPath,
        typeof presetId === 'string' ? presetId : undefined,
        skipConfirm === true,
      ),
  );

  const deletePresetCmd = vscode.commands.registerCommand(
    'edlc.deletePreset',
    () => deletePresetCommand(presetStore),
  );

  const installWorkflowGlobalsCmd = vscode.commands.registerCommand(
    'edlc.installWorkflowGlobals',
    () => installWorkflowGlobalsCommand(context.extensionPath, output),
  );

  const uninstallWorkflowGlobalsCmd = vscode.commands.registerCommand(
    'edlc.uninstallWorkflowGlobals',
    () => uninstallWorkflowGlobalsCommand(context.extensionPath, output),
  );

  const migrateEpicsCmd = vscode.commands.registerCommand(
    'edlc.migrateEpics',
    async () => {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!root) {
        void vscode.window.showWarningMessage('EDLC: open a project folder first.');
        return;
      }
      const report = migrateEpicStateFiles(root);
      const parts: string[] = [];
      if (report.migrated.length > 0) {
        parts.push(`migrated ${report.migrated.length}`);
      }
      if (report.backfilled.length > 0) {
        parts.push(`backfilled ${report.backfilled.length}`);
      }
      if (report.skipped.length > 0) {
        parts.push(`skipped ${report.skipped.length}`);
      }
      if (report.errors.length > 0) {
        parts.push(`${report.errors.length} error(s)`);
      }
      if (parts.length === 0) {
        void vscode.window.showInformationMessage('EDLC: no epics to migrate.');
        return;
      }
      const summary = `EDLC migration — ${parts.join(', ')}.`;
      const blockers: string[] = [];
      const skippedByReason = new Map<string, string[]>();
      for (const s of report.skipped) {
        const list = skippedByReason.get(s.reason) ?? [];
        list.push(s.epicId);
        skippedByReason.set(s.reason, list);
      }
      for (const [reason, ids] of skippedByReason) {
        const head = ids.slice(0, 3).join(', ');
        const more = ids.length > 3 ? `, +${ids.length - 3} more` : '';
        blockers.push(`${reason} (${head}${more})`);
      }
      if (report.errors.length > 0) {
        blockers.push(
          `${report.errors[0].epicId}: ${report.errors[0].reason}`,
        );
      }

      if (blockers.length > 0) {
        const detail = blockers.join('\n• ');
        void vscode.window.showWarningMessage(
          `${summary}\n• ${detail}`,
          { modal: false },
        );
      } else {
        void vscode.window.showInformationMessage(summary);
      }
    },
  );

  const startEpicCmd = vscode.commands.registerCommand(
    'edlc.startEpic',
    () => startEpicCommand(),
  );

  const openEpicsListCmd = vscode.commands.registerCommand(
    'edlc.openEpicsList',
    () => WorkspaceWebview.show(context.extensionUri, 'epics'),
  );

  const insertDemoEpicCmd = vscode.commands.registerCommand(
    'edlc.insertDemoEpic',
    () => insertDemoEpicCommand(),
  );

  const loadDemoProjectCmd = vscode.commands.registerCommand(
    'edlc.loadDemoProject',
    (mode?: unknown) =>
      loadDemoProjectCommand(
        mode === 'reseed' || mode === 'open-as-is' ? mode : undefined,
      ),
  );

  // Reuses an existing terminal if one is open so the user doesn't end up
  // with a stack of Claude REPLs after multiple clicks.
  //
  // Why we wait for shell integration instead of an immediate sendText:
  // some users have heavy `.zshrc` setups (oh-my-zsh update prompt,
  // direnv, nvm, asdf) that read stdin during init. A naked sendText
  // races those — `claude` lands in the wrong input buffer and never
  // actually runs, leaving the user staring at the rc-script prompt
  // wondering what happened. Shell integration's onDidChange fires
  // exactly when the prompt is ready, so executeCommand lands cleanly.
  /**
   * Send a slash command + carried feedback to the Claude REPL. Used by
   * the "Update with feedback" button on awaiting_work steps that have a
   * non-empty `feedback` field (cascade reject blame OR rerun feedback).
   *
   * Two paths:
   * 1. EDLC · Claude terminal already exists → assume `claude` is running
   *    in the REPL (most common case — we created it earlier and the user
   *    didn't kill it). `terminal.sendText(prompt, false)` types the
   *    prompt into the REPL with NO trailing newline so the user reviews
   *    and presses Enter, keeping them in control. If claude actually
   *    exited (rare), the prompt lands at the shell prompt and the user
   *    sees a shell error — recovery is to run `claude` and re-click.
   * 2. No terminal yet → create one and launch `claude '<prompt>'` as the
   *    one-shot initial command. Claude takes the prompt as its first
   *    user message, so the slash command processes immediately on boot.
   *    Single-quote-escaped via the standard `'\''` POSIX trick so quoted
   *    feedback bodies survive intact.
   *
   * Avoids the previous "wait 2.2s then sendText" approach that races
   * against claude's boot — typing slash commands into a shell prompt that
   * doesn't recognize them produces a confusing error.
   */
  const runWithFeedbackCmd = vscode.commands.registerCommand(
    'edlc.runStepWithFeedback',
    (slashCommand?: unknown, runId?: unknown, feedback?: unknown) => {
      const slash = typeof slashCommand === 'string' ? slashCommand.trim() : '';
      const id = typeof runId === 'string' ? runId.trim() : '';
      const fb = typeof feedback === 'string' ? feedback.trim() : '';
      if (!slash || !id) { return; }

      const prompt = fb
        ? `${slash} ${id} — Update artifact per feedback: "${fb.replace(/"/g, '\\"')}"`
        : `${slash} ${id}`;

      const TERMINAL_NAME = 'EDLC · Claude';
      const existing = vscode.window.terminals.find((t) => t.name === TERMINAL_NAME);
      if (existing) {
        existing.show(false);
        existing.sendText(prompt, false);
        return;
      }

      // Fresh terminal — bake the prompt into the claude launch command.
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      const cwd = root && fs.existsSync(root) ? root : undefined;
      const terminal = vscode.window.createTerminal({
        name: TERMINAL_NAME,
        cwd,
        iconPath: new vscode.ThemeIcon('rocket'),
        location: vscode.TerminalLocation.Panel,
        env: {
          DISABLE_AUTO_UPDATE: 'true',
          DISABLE_UPDATE_PROMPT: 'true',
        },
      });
      terminal.show(false);

      // POSIX single-quote escape: the only risky character in single-
      // quoted strings is the single quote itself, replaced with '\''.
      const escaped = prompt.replace(/'/g, "'\\''");
      const oneShot = `claude '${escaped}'`;

      let sent = false;
      const integ = vscode.window.onDidChangeTerminalShellIntegration((e) => {
        if (e.terminal === terminal && e.shellIntegration && !sent) {
          sent = true;
          e.shellIntegration.executeCommand(oneShot);
          integ.dispose();
        }
      });
      // Fallback for shells without integration — same 2s window as
      // openClaudeTerminal. addNewLine=true so claude actually launches.
      setTimeout(() => {
        if (!sent) {
          sent = true;
          terminal.sendText(oneShot, true);
          integ.dispose();
        }
      }, 2000);
    },
  );

  const openClaudeTerminalCmd = vscode.commands.registerCommand(
    'edlc.openClaudeTerminal',
    () => {
      const TERMINAL_NAME = 'EDLC · Claude';
      const existing = vscode.window.terminals.find((t) => t.name === TERMINAL_NAME);
      if (existing) { existing.show(false); return; }
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      const cwd = root && fs.existsSync(root) ? root : undefined;
      const terminal = vscode.window.createTerminal({
        name: TERMINAL_NAME,
        cwd,
        // Inherit user's default shell + their full rc init. Forcing
        // /bin/zsh skipped some users' login shell config (chsh) so we
        // let VS Code pick.
        iconPath: new vscode.ThemeIcon('rocket'),
        location: vscode.TerminalLocation.Panel,
        env: {
          // oh-my-zsh's weekly update check is an INTERACTIVE Y/n
          // prompt. It blocks .zshrc from finishing, which means shell
          // integration never installs, and our sendText fallback
          // ends up answering the prompt instead of running `claude`.
          // Disable update auto-check for this terminal only so init
          // completes cleanly. Users still see updates in their other
          // terminals.
          DISABLE_AUTO_UPDATE: 'true',
          DISABLE_UPDATE_PROMPT: 'true',
        },
      });
      terminal.show(false);

      let sent = false;
      const integ = vscode.window.onDidChangeTerminalShellIntegration((e) => {
        if (e.terminal === terminal && e.shellIntegration && !sent) {
          sent = true;
          e.shellIntegration.executeCommand('claude');
          integ.dispose();
        }
      });
      // Fallback for shells without integration (custom shells, or
      // VS Code shellIntegration disabled in settings). 2s is enough
      // for typical .zshrc init; more than that and the user can run
      // `claude` themselves.
      setTimeout(() => {
        if (!sent) {
          sent = true;
          terminal.sendText('claude', true);
          integ.dispose();
        }
      }, 2000);
    },
  );

  // Pipeline run commands (phase 1 orchestrator).
  const startRunCmd = vscode.commands.registerCommand(
    'edlc.startPipelineRun',
    (pipelineId?: unknown) =>
      startPipelineRunCommand(typeof pipelineId === 'string' ? pipelineId : undefined),
  );
  const toStepIdx = (v: unknown): number | undefined =>
    typeof v === 'number' && Number.isInteger(v) ? v : undefined;
  const markStepDoneCmd = vscode.commands.registerCommand(
    'edlc.markStepDone',
    (runId?: unknown, stepIdx?: unknown) =>
      markStepDoneCommand(typeof runId === 'string' ? runId : undefined, toStepIdx(stepIdx)),
  );
  const approveStepCmd = vscode.commands.registerCommand(
    'edlc.approveStep',
    (runId?: unknown, stepIdx?: unknown) =>
      approveStepCommand(typeof runId === 'string' ? runId : undefined, toStepIdx(stepIdx)),
  );
  const rejectStepCmd = vscode.commands.registerCommand(
    'edlc.rejectStep',
    (runId?: unknown, stepIdx?: unknown) =>
      rejectStepCommand(typeof runId === 'string' ? runId : undefined, toStepIdx(stepIdx)),
  );
  const rerunStepCmd = vscode.commands.registerCommand(
    'edlc.rerunStep',
    (runId?: unknown, stepIdx?: unknown) =>
      rerunStepCommand(typeof runId === 'string' ? runId : undefined, toStepIdx(stepIdx)),
  );
  const runAutoReviewCmd = vscode.commands.registerCommand(
    'edlc.runAutoReview',
    (runId?: unknown, stepIdx?: unknown) =>
      runAutoReviewCommand(typeof runId === 'string' ? runId : undefined, toStepIdx(stepIdx)),
  );
  const openRunStateCmd = vscode.commands.registerCommand(
    'edlc.openRunState',
    (runId?: unknown) => openRunStateCommand(typeof runId === 'string' ? runId : undefined),
  );
  const deleteRunCmd = vscode.commands.registerCommand(
    'edlc.deleteRun',
    (runId?: unknown, skipConfirm?: unknown) =>
      deleteRunCommand(
        typeof runId === 'string' ? runId : undefined,
        skipConfirm === true,
      ),
  );

  return {
    disposables: [
      showCmd,
      initCmd,
      openGettingStartedCmd,
      addSkillCmd,
      addAgentCmd,
      addPipelineCmd,
      openBuilderCmd,
      openClaudeTerminalCmd,
      runWithFeedbackCmd,
      savePresetCmd,
      savePresetInlineCmd,
      applyPresetCmd,
      deletePresetCmd,
      installWorkflowGlobalsCmd,
      uninstallWorkflowGlobalsCmd,
      migrateEpicsCmd,
      startEpicCmd,
      openEpicsListCmd,
      insertDemoEpicCmd,
      loadDemoProjectCmd,
      startRunCmd,
      markStepDoneCmd,
      approveStepCmd,
      rejectStepCmd,
      rerunStepCmd,
      runAutoReviewCmd,
      openRunStateCmd,
      deleteRunCmd,
    ],
    presetStore,
  };
}

function getWorkspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

/**
 * Require a workspace folder. If none is open, show a warning that points
 * the user back to the sidebar's Open Project flow. We don't surface a
 * folder picker here because Init / Apply / Save commands are explicitly
 * scoped to the *currently active* project — switching projects is its
 * own action (sidebar ⇄ button or "Switch Project" command).
 */
function requireWorkspaceRoot(): string | undefined {
  const root = getWorkspaceRoot();
  if (!root) {
    void vscode.window.showWarningMessage(
      'EDLC: Open a project first — this command targets the currently active workspace folder.',
    );
    return undefined;
  }
  return root;
}

async function showWorkspaceConfig(output: vscode.OutputChannel): Promise<void> {
  const root = requireWorkspaceRoot();
  if (!root) { return; }

  try {
    const loaded = WorkspaceLoader.load(root);

    output.clear();
    output.appendLine(`✓ Loaded ${loaded.configPath}`);
    output.appendLine('');
    output.appendLine(`name:    ${loaded.config.name}`);
    output.appendLine(`version: ${loaded.config.version}`);
    output.appendLine('');

    output.appendLine(`agents (${loaded.config.agents.length}):`);
    for (const a of loaded.config.agents) {
      output.appendLine(`  - ${a.id}  [${a.runner}]  → skills: ${a.skills.join(', ')}`);
    }
    output.appendLine('');

    output.appendLine(`skills (${loaded.config.skills.length}):`);
    for (const s of loaded.config.skills) {
      const src = s.builtin ? 'builtin' : (s.path ?? '(no source)');
      const status = loaded.skills.has(s.id) ? '✓' : '✗';
      output.appendLine(`  ${status} ${s.id}  → ${src}`);
    }
    output.appendLine('');

    output.appendLine(`slash_commands (${loaded.config.slash_commands.length}):`);
    for (const c of loaded.config.slash_commands) {
      const target = 'agent' in c ? `agent ${c.agent}` : `pipeline ${c.pipeline}`;
      output.appendLine(`  ${c.name}  → ${target}`);
    }
    output.appendLine('');

    output.appendLine(`pipelines (${loaded.config.pipelines.length}):`);
    for (const p of loaded.config.pipelines) {
      const stepLabels = p.steps.map(stepAgentId).join(' → ');
      output.appendLine(`  ${p.id}: ${stepLabels}  (on_failure: ${p.on_failure})`);
    }
    output.appendLine('');

    if (loaded.config.state) {
      output.appendLine(`state:`);
      output.appendLine(`  entity: ${loaded.config.state.entity}`);
      output.appendLine(`  root:   ${loaded.config.state.root}`);
    }

    if (loaded.config.sidebar?.views.length) {
      output.appendLine(`sidebar.views (${loaded.config.sidebar.views.length}):`);
      for (const v of loaded.config.sidebar.views) {
        output.appendLine(`  - ${v.type}${'label' in v && v.label ? ` (${v.label})` : ''}`);
      }
    }

    output.appendLine('');
    output.appendLine('— resolved environment —');
    const env = loaded.envResolver.resolveLayered(loaded.config.environment, undefined);
    for (const [k, v] of Object.entries(env)) {
      const masked = /KEY|TOKEN|SECRET|PASSWORD/i.test(k) && v ? '***' : v || '(empty)';
      output.appendLine(`  ${k} = ${masked}`);
    }

    output.show(true);
    void vscode.window.showInformationMessage(
      `EDLC workspace loaded: ${loaded.config.agents.length} agent(s), ${loaded.config.skills.length} skill(s).`,
    );
  } catch (err) {
    handleLoadError(err, output);
  }
}

function handleLoadError(err: unknown, output: vscode.OutputChannel): void {
  if (err instanceof WorkspaceNotFoundError) {
    void vscode.window
      .showWarningMessage(
        `No \`.edlc/${WORKSPACE_FILENAME}\` found. Initialize one?`,
        'Initialize',
      )
      .then((choice) => {
        if (choice === 'Initialize') {
          void vscode.commands.executeCommand('edlc.initWorkspace');
        }
      });
    return;
  }
  if (err instanceof WorkspaceValidationError) {
    output.clear();
    output.appendLine(`✗ ${err.message}`);
    output.appendLine('');
    output.appendLine('Issues:');
    for (const i of err.issues) {
      output.appendLine(`  ${i.path.join('.') || '<root>'}: ${i.message}`);
    }
    output.show(true);
    void vscode.window.showErrorMessage(
      'EDLC workspace.yaml has validation errors. See EDLC output channel.',
    );
    return;
  }
  if (err instanceof WorkspaceParseError) {
    void vscode.window.showErrorMessage(`EDLC: ${err.message}`);
    return;
  }
  const msg = err instanceof Error ? err.message : String(err);
  output.appendLine(`✗ Unexpected error: ${msg}`);
  output.show(true);
  void vscode.window.showErrorMessage(`EDLC: failed to load workspace — ${msg}`);
}

async function initWorkspace(
  output: vscode.OutputChannel,
  context: vscode.ExtensionContext,
  /**
   * Pre-selected workflow id. When supplied (webview's `InitWorkflowModal`
   * already prompted the user), skip the VS Code QuickPick and apply
   * directly. Sentinel value `'__empty__'` means the user explicitly chose
   * "Empty workspace" in the modal — scaffold an empty `workspace.yaml`
   * without showing the picker.
   */
  workflowIdArg?: string,
): Promise<void> {
  const root = requireWorkspaceRoot();
  if (!root) { return; }

  const edlcDir = path.join(root, WORKSPACE_DIR);
  const workspaceFile = path.join(edlcDir, WORKSPACE_FILENAME);

  if (fs.existsSync(workspaceFile)) {
    const choice = await vscode.window.showWarningMessage(
      `${WORKSPACE_DIR}/${WORKSPACE_FILENAME} already exists. Overwrite?`,
      { modal: false },
      'Overwrite',
      'Cancel',
    );
    if (choice !== 'Overwrite') {
      return;
    }
  }

  // When invoked from the webview's InitWorkflowModal, `workflowIdArg`
  // carries the user's choice already. Skip the VS Code QuickPick — it
  // would feel redundant after the React modal. An undefined arg means
  // command-palette invocation (fall back to the native picker).
  interface PipelinePick extends vscode.QuickPickItem {
    workflowId?: string;
  }
  let chosenWorkflowId: string | undefined;
  let chosenEmpty = false;
  if (workflowIdArg && workflowIdArg !== EMPTY_WORKSPACE_SENTINEL) {
    chosenWorkflowId = workflowIdArg;
  } else if (workflowIdArg === EMPTY_WORKSPACE_SENTINEL) {
    chosenEmpty = true;
  } else {
    const picks: PipelinePick[] = [
      ...BUILTIN_WORKFLOWS.map((w) => {
        const recommended = w.id === 'sdlc-parallel-pipeline';
        return {
          label: recommended ? `$(star-full) ${w.name}` : w.name,
          description: recommended ? 'Recommended' : '',
          detail: w.description,
          workflowId: w.id,
        } satisfies PipelinePick;
      }),
      {
        label: '$(file) Empty workspace',
        description: 'Start from scratch',
        detail: 'Scaffold an empty workspace.yaml — add agents / skills / pipelines yourself.',
      },
    ];
    const picked = await vscode.window.showQuickPick(picks, {
      title: 'Initialize EDLC workspace',
      placeHolder: 'Pick a starting workflow (or start empty)',
      ignoreFocusOut: true,
      matchOnDetail: true,
    });
    if (!picked) { return; }
    chosenWorkflowId = picked.workflowId;
    chosenEmpty = !picked.workflowId;
  }

  if (chosenWorkflowId) {
    // Apply the chosen built-in preset — handles install-globals prompt
    // and writes workspace.yaml + .claude/commands/*. `skipConfirm: true`
    // because the user already confirmed at the overwrite prompt above
    // (or there was no existing file).
    await vscode.commands.executeCommand('edlc.applyPreset', chosenWorkflowId, true);
    void vscode.commands.executeCommand('edlc.openBuilder');
    openGettingStartedGuide(context);
    return;
  }
  void chosenEmpty;

  try {
    fs.mkdirSync(edlcDir, { recursive: true });
    const workspaceName = vscode.workspace.workspaceFolders?.[0]?.name
      ?? path.basename(root);
    fs.writeFileSync(workspaceFile, sampleWorkspaceYaml(workspaceName), 'utf8');
    output.appendLine(`[init] wrote ${workspaceFile}`);

    void vscode.window
      .showInformationMessage(
        'EDLC workspace initialized at .edlc/. Open Builder?',
        'Open Builder',
      )
      .then((choice) => {
        if (choice === 'Open Builder') {
          void vscode.commands.executeCommand('edlc.openBuilder');
        }
      });
    // Open the new workspace.yaml so the user can edit it
    const doc = await vscode.workspace.openTextDocument(workspaceFile);
    await vscode.window.showTextDocument(doc, { preview: false });
    openGettingStartedGuide(context);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    void vscode.window.showErrorMessage(`EDLC init failed: ${msg}`);
  }
}

/**
 * Open the bundled Getting Started markdown in VS Code's markdown preview.
 * Falls back to opening the file as a regular text doc when the preview
 * command isn't available. Idempotent — VS Code re-focuses the existing
 * preview tab if it's already open.
 */
function openGettingStartedGuide(context: vscode.ExtensionContext): void {
  const guidePath = path.join(context.extensionPath, 'media', 'getting-started.md');
  if (!fs.existsSync(guidePath)) {
    void vscode.window.showWarningMessage(
      `EDLC: getting-started guide not found at ${guidePath}.`,
    );
    return;
  }
  const uri = vscode.Uri.file(guidePath);
  void vscode.commands.executeCommand('markdown.showPreview', uri).then(
    undefined,
    () => {
      void vscode.window.showTextDocument(uri, { preview: false });
    },
  );
}
