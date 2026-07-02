# Bluestar Bursts Portfolio

This is the Bluestar Bursts portfolio site. It is an OpenRTC consumer app, not
the Plutonium product and not the OpenRTC developer portal.

## Dev Mode

```bash
pnpm dev
```

`pnpm dev` is a live consumer-demo mode. The site has no Stripe account and no
Firebase project in this workspace; shared cursors use the portfolio-specific
OpenRTC public key from `VITE_OPENRTC_API_KEY` and scoped space tokens from
production OpenRTC.

Use only the portfolio OpenRTC app identity here. Do not copy Plutonium,
Notebook, or sample-game keys into this repo.

## Build And Deploy

```bash
pnpm build
pnpm typecheck
pnpm test
```

GitHub Pages deploys read `VITE_OPENRTC_API_KEY` from this repo's Actions
secrets. That secret must be the portfolio app public key from the workspace
`[Portfolio App]` secret group.

The OpenRTC package is consumed through a local `file:../openrtc/packages/openrtc`
dependency in this workspace. Rebuild and reinstall the package copy after SDK
changes.

