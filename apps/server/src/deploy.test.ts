import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { openHint } from './config.ts';

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

describe('start-up message', () => {
  const listening = { host: '0.0.0.0', port: 8080 };
  it('names the published address, not only the container\'s own port', () => {
    expect(openHint({ TURBOKEEP_PUBLISHED: '0.0.0.0:47901' }, listening)).toMatch(/:47901 from any device.*8080 is mapped to 47901/);
    expect(openHint({ TURBOKEEP_PUBLISHED: '127.0.0.1:47901' }, listening)).toMatch(/localhost:47901 \(this machine only/);
  });
  it('without Docker it names the port it really listens on', () => {
    expect(openHint({}, { host: '0.0.0.0', port: 47901 })).toBe("Open http://<this machine's address>:47901");
    expect(openHint({}, { host: '127.0.0.1', port: 47901 })).toBe('Open http://127.0.0.1:47901');
  });
  it('compose passes the published address along', () => {
    expect(compose).toMatch(/TURBOKEEP_PUBLISHED: "\$\{TURBOKEEP_BIND:-0\.0\.0\.0\}:\$\{TURBOKEEP_PORT:-47901\}"/);
  });
});
