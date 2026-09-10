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
pnpm exec playwright install chromium firefox
pnpm test:connectivity
```

GitHub Pages deploys read `VITE_OPENRTC_API_KEY` from this repo's Actions
secrets. That secret must be the portfolio app public key from the workspace
`[Portfolio App]` secret group.

`pnpm test:connectivity` builds the production client and verifies isolated
Chromium contexts, a separate Chromium + Firefox pair, and same-browser tabs.
The cross-browser case disables `BroadcastChannel`, requires zero local-tab
peers and a live OpenRTC connection on both sides, and verifies newly moved,
exact cursor payloads in both directions. It uses the
managed production OpenRTC service and therefore requires the portfolio
`VITE_OPENRTC_API_KEY`; it is not a mocked transport test.

The public demo requests OpenRTC's `privacy: 'relay-only'` policy: no direct
addresses or local discovery, and relay-only WebRTC when available. The app
does not implement transport selection or reconnect loops. Ordinary room
capacity may advance to the next bounded space shard; credit, provider, and
rate-limit denials never do so. Failed admission displays a settled status
instead of a misleading green active-cursor count.

Dependency upgrade checkpoint (2026-09-10): published `openrtc@2.5.4`, with
unit/type/build validation. Cross-browser test implementation is not itself
evidence of a passing hosted run; record that result separately using the
reviewed Portfolio identity and workspace hosted-test lease. The legacy
emulator runner still requires harness identity/cleanup hardening before it
can supply release evidence.

The OpenRTC package is consumed from npm by default so this repo can be cloned
and developed without the full workspace. Workspace-local OpenRTC SDK changes
should be validated in `openrtc/` first, then consumed here after publish or an
explicit temporary local override.
