import * as path from 'path';
import { Command } from 'commander';

export function resolveWorkspaceRoot(cmd: Command): string {
  const opts = cmd.optsWithGlobals<{ workspace?: string }>();
  const raw = opts.workspace ?? process.env.EDLC_WORKSPACE ?? process.cwd();
  return path.resolve(raw);
}
