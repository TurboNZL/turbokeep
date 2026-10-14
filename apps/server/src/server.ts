import { serve } from '@hono/node-server';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp, VERSION } from './app.ts';
import { repoRoot } from './version.ts';
import { Updater } from './update.ts';
import { loadConfig, openHint } from './config.ts';
import { get, openDb } from './db.ts';
import { createUser } from './store.ts';
import { hashPassword } from './auth.ts';

const cfg = loadConfig();
const db = openDb(cfg.dataDir);
const setup: { code: string | null } = { code: null };

if (!get(db, 'select 1 x from users limit 1')) {
  const { TURBOKEEP_ADMIN_USER: user, TURBOKEEP_ADMIN_PASSWORD: pw } = process.env;
  if (user && pw) { createUser(db, user, hashPassword(pw)); console.log(`Created the first account "${user}" from TURBOKEEP_ADMIN_USER.`); }
  else {
    // the address may be public (a tunnel) before you have opened it: whoever makes the first account owns the server, so it needs a code only the log has
    setup.code = process.env.TURBOKEEP_SETUP_CODE || randomBytes(6).toString('hex');
    console.log(`\nNo account yet. Open the app and create yours with the setup code: ${setup.code}\n`);
  }
}

// "Update server" is offered only from a git checkout that has the script, under systemd (INVOCATION_ID) or when asked for (TURBOKEEP_UPDATE=1); TURBOKEEP_UPDATE=0 switches it off
const script = resolve(repoRoot, 'scripts/update.sh');
const underSystemd = !!process.env.INVOCATION_ID;
const offered = process.env.TURBOKEEP_UPDATE !== '0' && existsSync(script) && existsSync(resolve(repoRoot, '.git')) && (underSystemd || process.env.TURBOKEEP_UPDATE === '1');
const updater = offered ? new Updater({ script, restart: underSystemd, exit: () => process.exit(1) }) : undefined;

serve({ fetch: createApp(db, cfg, setup, updater).fetch, port: cfg.port, hostname: cfg.host }, (i) => {
  console.log(`TurboKeep ${VERSION} listening on ${cfg.host}:${i.port}, data in ${cfg.dataDir}, self-update: ${updater ? 'on' : 'off'}`);
  console.log(openHint({ host: cfg.host, port: i.port }));
});
