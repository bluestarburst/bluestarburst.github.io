# Portfolio Site Agent Guide

This repo is the Bluestar Bursts portfolio site. It is not the Plutonium
desktop/web app.

## OpenRTC Identity

- This site owns the workspace `.secrets` `[Portfolio App]` OpenRTC public API key, server secret, and app tag.
- Never copy these values into `../plutonium-src/`. Plutonium has a separate OpenRTC developer app.
- Set `VITE_OPENRTC_API_KEY` locally (see `.env.example`) and as the GitHub Actions secret used by `.github/workflows/deploy.yml`.
- Space discovery uses `space: portfolio-cursors` with **scoped-token auth only** via `spaceToken` (calls `v1SpacePublicTokens`). Bearer-namespace access is not supported.
- Provisioned spaces must have `requireScopedAuth: true` on `pluto-rtc-prod`. Run `enableSpaceAuth` once per namespace from your backend with `sk_live_...`.
- The public shared-cursor demo must run in OpenRTC strict/privacy mode: relay-only iroh, no local discovery, WebRTC relay-only/TURN-only behavior. Do not publish direct-address tickets from this site.
- The site depends on the workspace OpenRTC package (`file:../openrtc/packages/openrtc`). Run `pnpm --dir ../openrtc --filter openrtc build` before building this site when the SDK changes.

## Commands

```bash
pnpm dev
pnpm build
pnpm test        # vitest — shared-cursors room logic
pnpm typecheck
```

## OpenRTC dependency is a frozen copy

`openrtc` is a pnpm `file:` dependency, so it is **copied into the store at
install time, not live-linked**. After rebuilding the SDK
(`pnpm --dir ../openrtc --filter openrtc build`), the copy under
`node_modules/.pnpm/openrtc@file+...` stays stale until you refresh it:

```bash
rm -rf node_modules/.pnpm/openrtc@file* node_modules/openrtc && pnpm install
```

Skipping this means `typecheck`/`build` silently run against an old SDK.

## Shared-cursors OpenRTC usage

`app/components/SharedCursors.tsx` uses the namespaced client surface
(`client.peers.connect`, `client.advanced.nodeId`) plus the room methods
(`joinRoom` / `createRoom` / `leaveRoom` / `watchRoom`). Pure room-selection
logic lives in `app/components/sharedCursorsRooms.ts` and is unit-tested.
