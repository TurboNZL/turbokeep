import { build } from 'esbuild';
await build({
  entryPoints: ['src/server.ts'], outfile: 'dist/server.mjs', bundle: true, platform: 'node', target: 'node22', format: 'esm', minify: false,
  external: ['node:*'],
});
console.log('built apps/server/dist/server.mjs');
