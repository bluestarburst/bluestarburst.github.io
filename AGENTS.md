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

This workspace uses canonical tiers `local` / `dev` / `staging` / `prod`
(see `../env/README.md` from the workspace root). Select a tier with
`npm run env:use -- <tier>` at the workspace root and diagnose with
`npm run env:doctor`. Those are internal workspace orchestration tiers. The
portfolio is a standalone consumer and uses published packages plus the
managed public OpenRTC service. Only a named workspace platform test may import
the internal `openrtc/env` helper.
