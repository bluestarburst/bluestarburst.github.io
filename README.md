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
pnpm test:turnstile:integration
```

GitHub Pages deploys read `VITE_OPENRTC_API_KEY` from this repo's Actions
secrets. That secret must be the portfolio app public key from the workspace
`[Portfolio App]` secret group.

### Anonymous cursor verification

Set the public `VITE_TURNSTILE_SITE_KEY` in the selected local Vite overlay and
the GitHub Actions repository variable of the same name. The secret must never
be in this repository or a Vite variable: OpenRTC's existing backend reads its
Secret Manager reference from the Portfolio app's Turnstile configuration.
Both sides use the OpenRTC SDK action `openrtc_capability`; production verification must allow only
the deployed Portfolio hostname, never localhost. Keep local test identity and
hostname configuration separate from production.

The managed widget appears only when interaction is needed, obtains a fresh
single-use token for each anonymous capability request, and is removed on
settlement or unmount. Script loading is bounded to ten seconds; a challenge has
up to one minute. Cloudflare-owned retryable iframe, network, challenge, and
interactive-timeout failures stay pending for the widget's automatic retry;
permanent configuration failures settle the cursor status. There is no
BroadcastChannel fallback or app-level reconnect loop. Unit tests use a
simulated widget API; they do not prove real verification or cross-browser
transport. Production uses the Portfolio widget and OpenRTC application
configuration for `hargreaves.dev`; keep the Cloudflare site key, Secret Manager
secret, action, and hostname policy aligned. Do not use Cloudflare testing keys
against the production app. An absent site key omits the SDK verification
callback, while production backend enforcement rejects missing evidence.

`pnpm test:connectivity` builds the production client and verifies isolated
Chromium contexts, a separate Chromium + Firefox pair, and same-browser tabs.
The cross-browser case disables `BroadcastChannel`, requires zero local-tab
peers and a live OpenRTC connection on both sides, and verifies newly moved,
exact cursor payloads in both directions. It uses the
managed production OpenRTC service and therefore requires the portfolio
`VITE_OPENRTC_API_KEY`; it is not a mocked transport test.

`pnpm test:turnstile:integration` separately runs the actual widget helper in
Chromium and Firefox against Cloudflare's official success/failure test sitekeys.
It serves only the helper on an ephemeral loopback port, uses no OpenRTC app
identity or backend, and checks token completion, rejection and widget cleanup.
It does not change production build variables or upload browser traces.
This proves frontend integration, not server verification, real-token replay
protection, or cursor delivery. The live Siteverify dummy-key response may omit
the action required by OpenRTC; never weaken action/hostname checks to accept it.
Production challenges can reject browser automation, so the real-widget network
gate remains separate and currently unverified. See [Cloudflare testing
guidance](https://developers.cloudflare.com/turnstile/troubleshooting/testing/).

The public demo requests OpenRTC's `privacy: 'relay-only'` policy: no direct
addresses or local discovery, and relay-only WebRTC when available. The app
does not implement transport selection or reconnect loops. Ordinary room
capacity may advance to the next bounded space shard; credit, provider, and
rate-limit denials never do so. Failed admission displays a settled status
instead of a misleading green active-cursor count.

### Bounded overflow placement

Visitors first request the same primary space, preserving discovery for ordinary
two-browser visits. Only an explicit capacity rejection enables overflow into a
512-name pool of eight-member spaces (4,096 potential slots). Overflow starts at
a random candidate, visits no candidate twice, and stops after 16 total join
attempts. Unused names do not activate spaces. Probe exhaustion means no space
was found within that bound, not that every space in the pool is full.

Current local placement tests use the actual helper/defaults and simulated
authoritative capacity: all 2,000 overlapping participants are admitted for five
reproducible random seeds, with at most 6,000 total join attempts per sample.
They also verify primary-space co-location, immediate financial/trust denial,
probe bounds and departure cleanup. These are not signed-admission, shared-IP,
cross-browser transport or cost acceptance. Failed probes must be included in
the integrated provider-work measurements. In particular, the post-join SDK
observation gap below still needs resolution; a capacity mock is not proof that
the published runtime reports the rejection at this boundary.

Dependency upgrade checkpoint (2026-09-13): published `openrtc@2.7.0`, with
19 unit tests, typecheck, and production build passing. At source
`835bf703dacf9776a9cbbfcd5815ccf5a079b964`, the full connectivity suite passed
3/3 in 53.1 seconds: independent Chromium contexts, actual Chromium + Firefox
with `BroadcastChannel` unavailable and zero local peers, and same-browser
local broadcast. The cross-browser test required exact, newly moved cursor
payloads in both directions; an isolated run also passed in 21.4 seconds.
These runs used a managed local production build, the published SDK, the
Portfolio identity, and the managed production OpenRTC service under the
workspace `portfolio-production` lease. They do **not** prove the currently
deployed GitHub Pages bundle. The local emulator runner now has isolated
identity/cleanup and source-artifact gates; see
[local connectivity harness](docs/local-connectivity-harness.md). Wrapper tests
do not replace the pending source-current cross-browser run.

### Cursor publication pacing

Cursor movement now uses an application publication cap of 20 Hz: each 50 ms
window sends its latest value to SDK state and local broadcast, while the local
cursor remains responsive every frame. Partial windows flush once; idle periods
schedule nothing, and unmount cancels pending publication. SDK 2.7.0 coalesces
backpressured latest-state sends but does not impose this frequency ceiling.
Fake-clock tests exercise 1,000 movement updates over one second and observe
exactly 20 publications, including the final value, plus idle/unmount checks.
These are producer-counter tests, not measured relay byte counts or proof of the
1,000-visit workload. The earlier cross-browser evidence above predates this
pacing change and must be rerun before release. The later bounded overflow
placement change above expands the candidate pool, not per-space admission or
relay-only privacy.

### Pending SDK error-observation contract

The settled error labels above cover rejected `spaces.join()` calls only.
Published OpenRTC 2.7.0 does not expose an avenue coordination-error/status
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
