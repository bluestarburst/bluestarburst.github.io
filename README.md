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
19 unit tests, typecheck, and production build passing. At source
`835bf703dacf9776a9cbbfcd5815ccf5a079b964`, the full connectivity suite passed
3/3 in 53.1 seconds: independent Chromium contexts, actual Chromium + Firefox
with `BroadcastChannel` unavailable and zero local peers, and same-browser
local broadcast. The cross-browser test required exact, newly moved cursor
payloads in both directions; an isolated run also passed in 21.4 seconds.
These runs used a managed local production build, the published SDK, the
Portfolio identity, and the managed production OpenRTC service under the
workspace `portfolio-production` lease. They do **not** prove the currently
deployed GitHub Pages bundle. The legacy emulator runner still requires
harness identity/cleanup hardening before it can supply release evidence.

### Pending SDK error-observation contract

The settled error labels above cover rejected `spaces.join()` calls only.
Published OpenRTC 2.5.4 does not expose an avenue coordination-error/status
subscription. Its `diagnostics.onStateChange` observes peer route states;
`diagnostics.status()` reports runtime/WASM identity, not gateway admission.
Its public `RTCError` also lacks `retryAfterMs` and `resetAt`. Therefore the
portfolio cannot truthfully display a post-join gateway denial or retry time
from that release. A successful `join()` alone must not be treated as proof
that later presence publication succeeded.

The SDK must project typed service errors and recovery timing from its existing
coordination lifecycle owner through a public avenue observer, then publish
that API before this consumer adopts it. Consumer follow-up tests must inject
post-join terminal and time-based denials through that public API and verify
the rendered status/timing without adding polling, reconnect timers, or extra
admission requests. Peer absence, console interception, and a synthetic UI
timeout are not substitutes for authoritative service-error observations.

The OpenRTC package is consumed from npm by default so this repo can be cloned
and developed without the full workspace. Workspace-local OpenRTC SDK changes
should be validated in `openrtc/` first, then consumed here after publish or an
explicit temporary local override.
