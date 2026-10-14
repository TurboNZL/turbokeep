# Engine: which modules this app uses and where they live

Pinned to `TurboNZL/turboengine` at the commit in `.turboengine.json`. The engine is a reference, not a dependency: modules are copies. `node scripts/engine-diff.mjs <this-app> --show` (run in the engine) shows how far this app has drifted.

| Module | Here | Notes |
|---|---|---|
| `release-pipeline` | `.github/workflows/{auto-pr,check,release,android}.yml` | `auto-pr.yml` as is. `check.yml`: tsc + tests + builds + the Android build. `release.yml`: `release` job as is; `android` attaches `turbokeep-<version>-android.apk`. `android.yml` (ours): builds the app on every non-main push, because auto-pr's PRs do not start workflows. |
| `appearance` | `apps/web/src/lib/{appearance,layout,useCatalog}.ts`, `layouts.css`, `components/{AppearanceCard,ThemeUpdates}.tsx`, `index.css`, `fonts.css`, `tailwind.config.ts`, `Layout.tsx` (rewritten: one button per Home view) | `storagePrefix: 'turbokeep'`, `fonts: 'none'` with the bundled fontsource packages (a self-hosted copy must work offline), no `lens`/`host` options (no phone WebView, no desktop shell). Layouts: side, rail, topbar, dock (the engine's `toolbar` layout is Curator-specific and was dropped with its CSS). The preview mock in `AppearanceCard.tsx` shows notes and tasks. |
| `guides-and-docs` | `lib/{guides,markdown}.ts`, `components/GuidesTab.tsx`, `docs/guides/*` | Group names changed to Start / Using it / Hosting. `markdown.ts` also renders note previews (it escapes everything and only links http(s)/mailto). |
| `settings-shell` | `components/Section.tsx`, `pages/Settings.tsx` | Tab strip that wraps. No pairing code (no other clients). |
| `logos` | `scripts/gen-icons.mjs`, `scripts/logo/lib.mjs`, `branding/logo.json`, `branding/emblems/check.json`, `apps/web/public/icon*.png/svg` | Engine mark + a check-mark emblem. Regenerate with `PLAYWRIGHT_MODULE=<playwright index.mjs> node scripts/gen-icons.mjs --png` and look at `--sheet`. Web only: no Android or Electron outputs in `logo.json`. |
| `server-install-update` | `scripts/{install-pi,update}.sh`, `apps/server/src/{update,version}.ts`, `components/ServerUpdate.tsx`, `docs/guides/{SELF_HOSTING,BACKUP_AND_UPDATE}.md` | Taken from TurboPantry's adaptation. The server is an esbuild bundle, so both scripts build it; the installer clones with tags (`git describe` gives the version) and sets a setup code. Owner = lowest user id. The update path was run for real (restart loop standing in for systemd, a local bare origin: 202, pull, build, exit 1, restart, new version). The installer itself only with `--dry-run`. |
| `updaters` (Android half) | `apps/android/.../update/{AppUpdater,Releases}.kt`, `lib/native.ts`, `components/AndroidCard.tsx` | Same updater; card trimmed. |
| `android-shell` | `apps/android` | Different on purpose: loads the server's page in a WebView (no bundled copy, no CORS, no version skew); widget, quick add, share target; bridge `TurboKeepAndroid`. Not run on a device: built by CI only. |

Not used, on purpose: `cloudflare-access` fields in the web page, `device-pairing`, `editions`, `window-frame`, `termux-server`, `gpu-modes`, `discord-presence` (see `notes` in `.turboengine.json`). Docker was used first (`docker-self-host` module) and removed in favour of the engine's native way.

## Upgrading
1. In the engine: `node scripts/engine-diff.mjs ../turbokeep --show`.
2. Port what is wanted, update `engine.ref`.
3. The themes package is a git dependency (`github:TurboNZL/turboengine#path:/themes`): `pnpm update turbothemes` moves the lockfile to the engine's current commit. Themes themselves update at run time from `themes/dist` without a release.
