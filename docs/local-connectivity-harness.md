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

Every invocation uses random app/developer/run IDs, fresh Firebase/Workers
storage, random loopback ports, and owned POSIX process groups. The issuer only
accepts canonical platform project names, so the private emulator uses the
`openrtc-platform-staging` project string. **This is not hosted staging:**
Firestore/Auth endpoints point only to newly spawned local processes. Source
dotenv files and ambient cloud credentials are not copied into the isolated
Functions runtime. Existing listeners cause refusal, never cleanup. Seeding
uses create-only documents and no global reset. Teardown waits for descendant
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
