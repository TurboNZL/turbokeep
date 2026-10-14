import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** The checkout this server runs from: apps/server/src (dev) and apps/server/dist (the bundle) are both three folders below it. */
export const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

/** The version this server reports: TURBOKEEP_VERSION when set, else the newest release tag of the git checkout (the installer clones with tags), else "dev". */
function gitVersion(): string {
  try { return execFileSync('git', ['-C', repoRoot, 'describe', '--tags', '--always'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || 'dev'; } catch { return 'dev'; }
}
export const VERSION = process.env.TURBOKEEP_VERSION || gitVersion();
