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

/**
 * The line that tells a person what to open. Inside a container the server listens on its own port (8080), which is NOT the number to type:
 * docker-compose.yml hands the published address over as TURBOKEEP_PUBLISHED ("<bind>:<port>") so the log can name it.
 */
export function openHint(env: NodeJS.ProcessEnv, listening: { host: string; port: number }): string {
  const m = /^(.*):(\d{1,5})$/.exec(env.TURBOKEEP_PUBLISHED ?? '');
  if (!m) return `Open http://${listening.host === '0.0.0.0' ? '<this machine\'s address>' : listening.host}:${listening.port}`;
  const [, bind, port] = m;
  const loopback = bind === '127.0.0.1' || bind === 'localhost';
  return loopback
    ? `Open http://localhost:${port} (this machine only: TURBOKEEP_BIND is ${bind}). The container's own port ${listening.port} is mapped to it.`
    : `Open http://<this machine's address>:${port} from any device on your network (for a Raspberry Pi: its IP address or raspberrypi.local). The container's own port ${listening.port} is mapped to ${port}.`;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const bool = (v: string | undefined, d: boolean) => (v === undefined || v === '' ? d : /^(1|true|yes|on)$/i.test(v));
  return {
    port: Number(env.TURBOKEEP_PORT ?? env.PORT ?? 47901), // 47901 is TurboKeep's in the engine's port list; the Docker image sets PORT=8080 inside its own network
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
