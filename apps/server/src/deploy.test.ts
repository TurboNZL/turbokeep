import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const compose = readFileSync(new URL('../../../docker-compose.yml', import.meta.url), 'utf8');

describe('docker-compose.yml', () => {
  it('never requires a variable: compose reads them for every service, even one in a profile that is not running', () => {
    // `${X:?message}` made a plain `docker compose up` fail with "required variable TUNNEL_TOKEN is missing" on a machine without a tunnel
    expect(compose).not.toMatch(/\$\{[A-Za-z_]+:?\?/);
  });
  it('publishes a port that is not 8080, can be moved, and is reachable from the network by default', () => {
    // a published 127.0.0.1 is invisible to every other machine (the owner's Pi could not be opened from his PC)
    expect(compose).toMatch(/\$\{TURBOKEEP_BIND:-0\.0\.0\.0\}:\$\{TURBOKEEP_PORT:-47901\}:8080/);
  });
});
