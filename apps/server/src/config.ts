import { resolve } from 'node:path';

/** Everything the server reads from the environment, in one place (documented in docs/guides/SELF_HOSTING.md). */
export interface Config {
  port: number;
  host: string;
  dataDir: string;
  webDir: string;
  /** Behind a reverse proxy or a Cloudflare tunnel: believe X-Forwarded-* and CF-Connecting-IP. */
  trustProxy: boolean;
  /** Anyone may create an account (otherwise only the first one, made on first run). */
  allowSignup: boolean;
  /** Extra browser origins allowed to send cookie-authenticated writes (comma separated), besides the host the request came to. */
  origins: string[];
  /** Largest import accepted, in bytes. */
  maxImportBytes: number;
  sessionDays: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const bool = (v: string | undefined, d: boolean) => (v === undefined || v === '' ? d : /^(1|true|yes|on)$/i.test(v));
  return {
    port: Number(env.PORT ?? 8080),
    host: env.HOST ?? '0.0.0.0',
    dataDir: resolve(env.TURBOKEEP_DATA ?? './data'),
    webDir: resolve(env.TURBOKEEP_WEB ?? './apps/web/dist'),
    trustProxy: bool(env.TURBOKEEP_TRUST_PROXY, true),
    allowSignup: bool(env.TURBOKEEP_ALLOW_SIGNUP, false),
    origins: (env.TURBOKEEP_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    maxImportBytes: Number(env.TURBOKEEP_MAX_IMPORT_MB ?? 256) * 1024 * 1024,
    sessionDays: Number(env.TURBOKEEP_SESSION_DAYS ?? 30),
  };
}
