# Bluestar Bursts Portfolio

This is the Bluestar Bursts portfolio site. It is an OpenRTC consumer app, not
the Plutonium product and not the OpenRTC developer portal.

## Dev Mode

```bash
pnpm mode
pnpm env:setup -- --tier dev
pnpm env:doctor -- --tier dev
pnpm dev
```

`pnpm dev` is a live consumer-demo mode. The site has no Stripe account and no
Firebase project in this workspace; shared cursors use the portfolio-specific
OpenRTC public key from `VITE_OPENRTC_API_KEY` and scoped space tokens from
production OpenRTC. `pnpm env:setup` writes `.env.development.local`; set the
portfolio-specific `VITE_OPENRTC_API_KEY` there for local development.

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

The OpenRTC package is consumed from npm by default so this repo can be cloned
and developed without the full workspace. Workspace-local OpenRTC SDK changes
should be validated in `openrtc/` first, then consumed here after publish or an
explicit temporary local override.
