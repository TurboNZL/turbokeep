# Engine: which modules this app uses and where they live

Pinned to `TurboNZL/turboengine` at the commit in `.turboengine.json`. The engine is a reference, not a dependency: modules are copies. `node scripts/engine-diff.mjs <this-app> --show` (run in the engine) shows how far this app has drifted.

| Module | Here | Notes |
|---|---|---|
| `release-pipeline` | `.github/workflows/{auto-pr,check,release}.yml` | `auto-pr.yml` as is. `check.yml`: tsc + tests + build + a Docker build. `release.yml`: `release` job as is; `docker` (ghcr.io, amd64+arm64) and `node-bundle` replace desktop/android. Asset `turbokeep-<version>-node.tar.gz`. |
| `appearance` | `apps/web/src/lib/{appearance,layout,useCatalog}.ts`, `layouts.css`, `components/{AppearanceCard,ThemeUpdates}.tsx`, `index.css`, `fonts.css`, `tailwind.config.ts`, `Layout.tsx` (rewritten for 3 pages) | `storagePrefix: 'turbokeep'`, `fonts: 'none'` with the bundled fontsource packages (a self-hosted copy must work offline), no `lens`/`host` options (no phone WebView, no desktop shell). Layouts: side, rail, topbar, dock (the engine's `toolbar` layout is Curator-specific and was dropped with its CSS). The preview mock in `AppearanceCard.tsx` shows notes and tasks. |
| `guides-and-docs` | `lib/{guides,markdown}.ts`, `components/GuidesTab.tsx`, `docs/guides/*` | Group names changed to Start / Using it / Hosting. `markdown.ts` also renders note previews (it escapes everything and only links http(s)/mailto). |
| `settings-shell` | `components/Section.tsx`, `pages/Settings.tsx` | Tab strip that wraps. No pairing code (no other clients). |
| `docker-self-host` | `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `.env.example`, `apps/server/src/auth.ts` | New engine module created from this app. |

Not used, on purpose: `updaters`, `server-install-update`, `cloudflare-access`, `editions`, `window-frame`, `android-shell`, `termux-server`, `device-pairing`, `gpu-modes`, `discord-presence` (see `notes` in `.turboengine.json`).

## Upgrading
1. In the engine: `node scripts/engine-diff.mjs ../turbokeep --show`.
2. Port what is wanted, update `engine.ref`.
3. The themes package is a git dependency (`github:TurboNZL/turboengine#path:/themes`): `pnpm update turbothemes` moves the lockfile to the engine's current commit. Themes themselves update at run time from `themes/dist` without a release.
