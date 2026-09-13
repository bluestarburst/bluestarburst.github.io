import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { webkit } from '@playwright/test';
import { spawnOwned, stopOwned } from '../../scripts/emulator-processes.mjs';

const root = process.env.OPENRTC_SOURCE_ROOT;
if (!root) throw new Error('Explicit reviewed OPENRTC_SOURCE_ROOT is required');
const { validateArtifactManifest, canonicalFeatureKey, toolchainIdentity } =
  await import(pathToFileURL(join(root, 'scripts/lib/artifact-manifest.mjs')));
const { openRtcReleaseWasmManifestSpec } =
  await import(pathToFileURL(join(root, 'scripts/lib/openrtc-wasm-artifact.mjs')));
const wasmArtifact = validateArtifactManifest(openRtcReleaseWasmManifestSpec(root));
assert.ok(wasmArtifact.ok, `Current release WASM required: ${wasmArtifact.reason}`);

for (const local of [false, true]) test(`WebKit Iroh ${local ? 'loopback fixture' : 'default hosted strict TLS'}`, async () => {
  const server = createServer((req, res) => {
    const name = req.url?.slice(1);
    if (!name) { res.setHeader('Content-Type', 'text/html'); return res.end('<!doctype html><title>Relay regression</title>'); }
    if (!['openrtc.js', 'openrtc_bg.wasm'].includes(name)) { res.writeHead(404); return res.end(); }
    res.setHeader('Content-Type', name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript');
    res.end(readFileSync(join(root, 'packages/openrtc/wasm', name)));
  });
  let browser, relay, timer;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let relayUrl;
    if (local) {
      if (!process.env.OPENRTC_TEST_HARNESS_BIN) throw new Error('Manifested OPENRTC_TEST_HARNESS_BIN is required');
      const binary = process.env.OPENRTC_TEST_HARNESS_BIN;
      const toolchain = toolchainIdentity();
      const features = ['test-harness', 'transport-moq', 'transport-webrtc'];
      const nativeArtifact = validateArtifactManifest({
        manifestPath: `${binary}.manifest.json`, kind: 'native',
        target: `native:${toolchain.host}`, features, toolchain, artifactPaths: [binary],
        sourceRoots: ['crates/openrtc', 'Cargo.toml', 'Cargo.lock']
          .map(label => ({ path: join(root, label), label })),
        buildIdentity: { command: 'cargo build', binary: 'test-harness', profile: 'debug',
          featureKey: canonicalFeatureKey(features) },
      });
      assert.ok(nativeArtifact.ok, `Current native harness required: ${nativeArtifact.reason}`);
      relay = spawnOwned(process.env.OPENRTC_TEST_HARNESS_BIN, ['--iroh-relay', '--iroh-relay-port', '0'],
        { cwd: root, env: { PATH: process.env.PATH }, stdio: ['ignore', 'pipe', 'pipe'] });
      relay.child.stderr.resume();
      relayUrl = await Promise.race([
        new Promise((resolve, reject) => {
          let output = '';
          relay.child.stdout.on('data', chunk => {
            output += chunk;
            const match = output.match(/\[test-iroh-relay\] Listening on (https:\/\/\S+)/);
            if (match) resolve(match[1]);
          });
          relay.child.on('error', reject);
          relay.child.on('exit', () => reject(new Error('Relay exited before readiness')));
        }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Relay startup timeout')), 15000); }),
      ]);
      clearTimeout(timer);
      assert.equal(new URL(relayUrl).hostname, '127.0.0.1');
    }
    browser = await webkit.launch();
    // Only the owned self-signed loopback fixture relaxes certificate trust.
    const page = await browser.newPage({ ignoreHTTPSErrors: local });
    const probes = [], hosts = [], failures = [];
    let frames = 0;
    page.on('response', response => {
      if (new URL(response.url()).pathname === '/ping') probes.push(response.status());
    });
    page.on('requestfailed', request => {
      if (/certificate|ssl|tls/i.test(request.failure()?.errorText ?? '')) failures.push('TLS');
    });
    page.on('websocket', socket => {
      hosts.push(new URL(socket.url()).hostname);
      socket.on('framereceived', () => frames++);
      socket.on('socketerror', () => failures.push('WebSocket'));
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await Promise.race([
      page.evaluate(async relayUrl => {
        const wasm = await import('/openrtc.js');
        await wasm.default();
        const client = new wasm.WasmClient('pk_test_' + 'a'.repeat(40));
        globalThis.relayTestClient = client;
        if (relayUrl) await client.initIrohWithTestRelay(undefined, relayUrl);
        else await client.init_iroh();
        // Exercise the same admission sequence as managed browser startup;
        // relay reachability alone does not prove ticket creation can settle.
        client.clear_session_tokens();
        const ticket = await client.endpoint_ticket_with_token('user-device', 0);
        if (typeof ticket !== 'string' || !ticket.length) {
          throw new Error('Managed admission ticket was not created');
        }
      }, relayUrl),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Iroh address startup timeout')), 30000); }),
    ]);
    clearTimeout(timer);
    const deadline = Date.now() + 10000;
    while (!frames && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
    assert.ok(probes.includes(200), 'relay probe must succeed');
    assert.ok(frames > 0, 'relay must return protocol frames');
    assert.ok(hosts.length && hosts.every(host => !host.endsWith('.')));
    assert.deepEqual(failures, []);
  } finally {
    clearTimeout(timer);
    await browser?.close();
    if (relay) await stopOwned(relay);
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
