# Local cross-browser connectivity

This is a named OpenRTC co-development test, not the ordinary standalone
portfolio configuration. Its axes are consumer `emulator`, OpenRTC platform
`emulator`, and explicitly selected managed SDK source. The published package
pin and hosted credentials are unchanged.

Run the inexpensive wrapper checks first:

```sh
pnpm test:connectivity:runner
pnpm test
pnpm typecheck
```

The backend-only prerequisite can run without native or WASM artifacts:

```sh
OPENRTC_SOURCE_ROOT=/path/to/reviewed/openrtc pnpm test:connectivity:bootstrap
```

It rebuilds Functions, starts the same isolated gateway and Firebase services,
creates one finite emulator-only signup pool, and authenticates a disposable
developer through the Auth emulator. Two real HTTP `getAccount` calls must
produce one certified active budget, exactly two funding sources, and one pool
debit. The actual authority reader validates the result before app seeding.
No account balance or activation certificate is fabricated. This diagnostic
does not build an SDK, launch a relay/browser, or count as connectivity evidence.
The full command runs the same signup prerequisite before browser assertions.
An additional protocol-only gate is available with
`OPENRTC_SOURCE_ROOT=/path/to/reviewed/openrtc node scripts/run-openrtc-emulator-e2e.mjs --admission-burst`.
It attempts 100 distinct Ed25519 principals from one loopback IP, at eight
concurrent admissions, distributed across eight-peer spaces. It calls real
capability/grant HTTP endpoints, opens signed authenticated sockets, waits for
`ready`, and holds admitted sockets until all attempts finish. It uses the same
finite Free-app bootstrap funding; no retry, cap increase, SDK lifecycle mock,
or fabricated active budget is used. Synthetic endpoint tickets make this an
admission-only test, not Iroh connectivity, cursor delivery or the full consumer
workload. Earlier evidence admitted 18/100 and then 35/100 while exposing
excessive startup escrow. The final source-current 2.6 acceptance admitted
100/100 and kept every admitted socket open after the owning funding correction;
preserve that result as the release baseline.
Gateway limiter bindings come from the reviewed canonical gateway config;
shared admission/initialization/activation flags exist only in disposable config.
The disposable Functions runtime explicitly uses external Iroh relay accounting,
matching Portfolio's relay-only requirement. The full browser test asserts the
public `irohRelay` capability flag before waiting for startup. Managed TURN is
not marked ready, and the owned loopback relay is not a hosted deployment.

Before the browser run, use the workspace release preflight and harness gates.
Set `OPENRTC_SOURCE_ROOT` to the reviewed OpenRTC worktree. The runner refuses
implicit sibling/primary checkout selection. Prepare current release WASM with
`pnpm --dir "$OPENRTC_SOURCE_ROOT/packages/openrtc" build:wasm` and provide
`OPENRTC_TEST_HARNESS_BIN` from the existing OpenRTC all-carrier emulator build
producer (`tests/emulator/run-emulator-suite.mjs`, default `all` media feature
set). Its adjacent `.manifest.json` must match the current source, binary,
toolchain, and `test-harness+transport-moq+transport-webrtc` features. The
runner does not silently rebuild Rust or invent an artifact certificate.

Then, from this managed Portfolio checkout:

```sh
pnpm test:connectivity:emulator
```

The runner validates those existing manifests, builds TypeScript, builds the
consumer using `dist/testing.js`, and checks identical WASM hashes in the
source artifact, SDK output, and consumer bundle. Tracked and nonignored source
inputs are fingerprinted before and after the run; changes invalidate evidence.
Fingerprints include Functions/gateway configuration and dependencies. A reviewed
tracked deletion is recorded explicitly; restoring that file changes the digest.

Every invocation uses random app/developer/run IDs, fresh Firebase/Workers
storage, random loopback ports, and owned POSIX process groups. The issuer only
accepts canonical platform project names, so the private emulator uses the
`openrtc-platform-staging` project string. **This is not hosted staging:**
Firestore/Auth endpoints point only to newly spawned local processes. Source
dotenv files and ambient cloud credentials are not copied into the isolated
Functions runtime. Existing listeners cause refusal, never cleanup. Seeding
uses fresh run-owned identities and no global reset. Teardown waits for descendant
stdio closure; failed closure preserves the invocation's temporary files.

Gateway and Hosting readiness require the current run ID. Gateway dependencies
must also report the expected platform identity; Functions must return the
known structured invalid-API-key result, not merely any non-404 response.
Browser assertions require the run ID embedded in the test-only SDK alias.
The relay URL comes from the owned, manifested child stdout and must be HTTPS
loopback; it is not reused from a preexisting listener.

The Chromium/Firefox test disables BroadcastChannel in both browsers, checks
zero local-tab peers, and verifies exact cursor payloads in both directions.
Its success would prove this source-specific local connectivity lane, not
heavy workload acceptance, deployed policy, newest-package interoperability,
invoice reconciliation, or production readiness. The seeded Free app's
manifest is a small connectivity fixture, not proof of every subscription
tier or the 1,000-visit workload.

## Rendered budget-denial regression

`pnpm test:budget-errors` renders the shipping `SharedCursors` component with
the installed SDK in Chromium. It intercepts capability HTTP responses for app
budget exhaustion, provider safety pause and app throttling. Each must settle
to its specific safe label after exactly one admission attempt, with no remote
cursors or connections and no raw denial detail rendered.

The test uses a synthetic public key, no dotenv, a fresh browser context per
case, a private Vite cache, an exclusively bound random loopback port and an
exact per-run page identity. Nonlocal requests are intercepted or blocked;
no hosted services are called. Browser and server are owned by the test and
closed at completion. No connection lifecycle is mocked or replaced.

For an explicit source-only diagnostic, run
`OPENRTC_SOURCE_ROOT=/absolute/path/to/reviewed/openrtc pnpm test:budget-errors`.
This selects that worktree's TypeScript entry point, not an implicit sibling or
new published release. It proves HTTP denial projection only, not successful
WASM startup, peer connectivity, Turnstile, workload funding or release parity.
The prior 2.5.4 SDK reproduced all three incorrect generic error labels. The
installed 2.6.0 package now passes all three rendered denial cases, so this
command remains the consumer regression gate for future SDK updates.
