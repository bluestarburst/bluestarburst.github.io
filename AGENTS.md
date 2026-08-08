# Portfolio Site Agent Guide

This repo is the Bluestar Bursts portfolio site. It is not the Plutonium
desktop/web app.

## OpenRTC Identity

- This site owns the workspace `.secrets` `[Portfolio App]` OpenRTC public API key, server secret, and app tag.
- Never copy these values into `../plutonium-src/`. Plutonium has a separate OpenRTC developer app.
- Set `VITE_OPENRTC_API_KEY` locally (see `.env.example`) and as the GitHub Actions secret used by `.github/workflows/deploy.yml`.
- Space discovery uses `space: portfolio-cursors` with **scoped-token auth only** via `spaceToken` (calls `v1SpacePublicTokens`). Bearer-namespace access is not supported.
- This is the OpenRTC **space avenue**, so it uses ephemeral/live collaboration
  semantics. Do not import Plutonium's user-device persistent roster behavior
  here, and do not use this site as evidence for user-scope device retention.
- Provisioned spaces must have `requireScopedAuth: true` on `pluto-rtc-prod`. Run `enableSpaceAuth` once per namespace from your backend with `sk_live_...`.
- The public shared-cursor demo must run in OpenRTC strict/privacy mode: relay-only iroh, no local discovery, WebRTC relay-only/TURN-only behavior. Do not publish direct-address tickets from this site.
- The site depends on the published `openrtc` package by default. Do not make a
  standalone portfolio clone require `../openrtc`; use an explicit temporary
  local override only while debugging an SDK change.

## Commands

```bash
pnpm mode
pnpm dev
pnpm build
pnpm test        # vitest — shared-cursors room logic
pnpm typecheck
```

## OpenRTC Dependency

`openrtc` is a published npm dependency here. Keep workspace-local SDK
experiments out of committed package manifests so the public portfolio repo
stays installable by itself.

## Shared-cursors OpenRTC usage

`app/components/SharedCursors.tsx` uses the namespaced client surface
(`client.peers.connect`, `client.advanced.nodeId`) plus the room methods
(`joinRoom` / `createRoom` / `leaveRoom` / `watchRoom`). Pure room-selection
logic lives in `app/components/sharedCursorsRooms.ts` and is unit-tested.

## Environments

Standalone setup uses `pnpm env:setup -- --tier <dev|staging>` and
`pnpm env:doctor -- --tier <tier>`, which write `.env.development.local` or
`.env.staging.local`. Production values belong in GitHub Actions/deployment
secrets; the script's `--allow-prod-local` option is only for an explicit local
production smoke. Never route the app through `.env.local`.

The portfolio uses published packages, the managed production OpenRTC service,
and its own Portfolio identity in every app lane. Only a named workspace
platform test may import `openrtc/env` or select internal platform
staging/emulators. Root `npm run env:use` remains full-workspace orchestration,
not a standalone portfolio command.
