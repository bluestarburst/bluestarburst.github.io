#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash, generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync, cpSync, symlinkSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { allocatePorts, assertPortsFree, spawnOwned, assertAlive, stopOwned, waitForIdentity } from './emulator-processes.mjs';

const PORTFOLIO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
if (!process.env.OPENRTC_SOURCE_ROOT?.trim()) throw new Error('Set OPENRTC_SOURCE_ROOT to the reviewed managed OpenRTC worktree explicitly.');
const OPENRTC_ROOT = resolve(process.env.OPENRTC_SOURCE_ROOT);
const OPENRTC_FIREBASE = join(OPENRTC_ROOT, 'infra', 'firebase');
const OPENRTC_GATEWAY = join(OPENRTC_ROOT, 'packages', 'openrtc-coordination-gateway');
const WRANGLER = join(OPENRTC_GATEWAY, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const OPENRTC_TEST_HARNESS = process.env.OPENRTC_TEST_HARNESS_BIN?.trim();
const runId = randomUUID();
// The real issuer permits only canonical platform project IDs. Isolation is
// the fresh emulator process/storage and exclusive ports, not a fake project.
const PROJECT = 'openrtc-platform-staging';
const ports = await allocatePorts(['functions', 'hosting', 'firestore', 'firestoreWebsocket', 'auth', 'hub', 'logging', 'eventarc', 'tasks', 'gateway', 'web']);
const CONTROL_PLANE = `http://127.0.0.1:${ports.hosting}`;
const FUNCTIONS_ORIGIN = `http://127.0.0.1:${ports.functions}/${PROJECT}/us-central1`;
const GATEWAY_PORT = ports.gateway;
const GATEWAY = `http://127.0.0.1:${GATEWAY_PORT}`;
const API_KEY = `pk_test_${randomBytes(20).toString('hex')}`;
const SIGNING_SECRET = randomBytes(32).toString('hex');
const INGEST_SECRET = randomBytes(32).toString('hex');
const fixturePlan = process.env.PORTFOLIO_E2E_PLAN ?? 'free';
const webkitEndpoint = process.env.PORTFOLIO_WEBKIT_WS_ENDPOINT;
if (webkitEndpoint) {
  const endpoint = new URL(webkitEndpoint);
  if (endpoint.protocol !== 'ws:' || endpoint.hostname !== '127.0.0.1' || endpoint.username || endpoint.password) {
    throw new Error('The optional WebKit test server must be loopback-only');
  }
}
if (!['free', 'hobby', 'paid', 'internal'].includes(fixturePlan)) throw new Error('Invalid Portfolio E2E plan');
const FIREBASE_TOOLS = 'firebase-tools@15.19.0';
const children = [];
const isolatedConfig = mkdtempSync(join(tmpdir(), 'portfolio-openrtc-e2e-'));
const blockedAdc = join(isolatedConfig, 'no-production-adc.json');
const testingAlias = join(isolatedConfig, 'openrtc.testing.ts');
let teardownPromise;
let firebaseApp;
// Do not forward ambient cloud credentials, emulator routing, or app dotenv.
const localEnv = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'JAVA_HOME', 'LANG', 'SHELL'].flatMap(key => process.env[key] ? [[key, process.env[key]]] : []));
Object.assign(localEnv, { CLOUDSDK_CONFIG: isolatedConfig, GOOGLE_APPLICATION_CREDENTIALS: blockedAdc,
  GCLOUD_PROJECT: PROJECT, GOOGLE_CLOUD_PROJECT: PROJECT, OPENRTC_E2E_RUN_ID: runId,
  FIRESTORE_EMULATOR_HOST: `127.0.0.1:${ports.firestore}`, FIREBASE_AUTH_EMULATOR_HOST: `127.0.0.1:${ports.auth}` });

const signingKeyPair = generateKeyPairSync('ed25519');
const privateJwk = {
  ...signingKeyPair.privateKey.export({ format: 'jwk' }),
  kid: 'portfolio-v2-emulator',
};
const publicJwks = {
  keys: [{
    ...signingKeyPair.publicKey.export({ format: 'jwk' }),
    kid: 'portfolio-v2-emulator',
    alg: 'EdDSA',
    use: 'sig',
  }],
};

function log(message) {
  console.log(`[portfolio-openrtc-e2e] ${message}`);
}

function prepareLocalConfig() {
  const publicDir = join(isolatedConfig, 'public');
  const functionsDir = join(isolatedConfig, 'functions');
  mkdirSync(publicDir);
  mkdirSync(functionsDir);
  writeFileSync(join(publicDir, '__portfolio_run.json'), JSON.stringify({ runId, project: PROJECT }));
  // Copy generated runtime only, never the source directory's dotenv or secrets.
  cpSync(join(OPENRTC_FIREBASE, 'functions', 'lib'), join(functionsDir, 'lib'), { recursive: true });
  cpSync(join(OPENRTC_FIREBASE, 'functions', 'package.json'), join(functionsDir, 'package.json'));
  symlinkSync(join(OPENRTC_FIREBASE, 'functions', 'node_modules'), join(functionsDir, 'node_modules'));
  const canonical = JSON.parse(readFileSync(join(OPENRTC_FIREBASE, 'firebase.json'), 'utf8'));
  const canonicalGateway = JSON.parse(readFileSync(join(OPENRTC_GATEWAY, 'wrangler.jsonc'), 'utf8').replace(/^\s*\/\/.*$/gm, ''));
  const emulators = Object.fromEntries(['functions', 'hosting', 'firestore', 'auth', 'hub', 'logging', 'eventarc', 'tasks']
    .map(name => [name, { host: '127.0.0.1', port: ports[name] }]));
  emulators.firestore.websocketPort = ports.firestoreWebsocket;
  emulators.ui = { enabled: false };
  emulators.singleProjectMode = true;
  writeFileSync(join(isolatedConfig, 'firebase.json'), JSON.stringify({
    functions: [{ source: 'functions', codebase: 'default', disallowLegacyRuntimeConfig: true }],
    firestore: { rules: join(OPENRTC_FIREBASE, 'firestore.rules'), indexes: join(OPENRTC_FIREBASE, 'firestore.indexes.json') },
    hosting: { public: 'public', rewrites: canonical.hosting.find(entry => entry.target === 'api').rewrites.filter(entry => entry.function) },
    emulators,
  }));
  const gatewayEntry = join(OPENRTC_GATEWAY, 'src', 'index.ts');
  writeFileSync(join(isolatedConfig, 'gateway.ts'), [
    `import gateway from ${JSON.stringify(gatewayEntry)};`,
    `export * from ${JSON.stringify(gatewayEntry)};`,
    `export default { ...gateway, fetch(request, env, context) {`,
    `if (new URL(request.url).pathname === '/__portfolio_run') return Response.json({runId: env.PORTFOLIO_RUN_ID, project: env.OPENRTC_FIREBASE_PROJECT_ID});`,
    `return gateway.fetch(request, env, context); } };`,
  ].join('\n'));
  writeFileSync(join(isolatedConfig, 'wrangler.json'), JSON.stringify({
    name: `portfolio-${runId}`, main: './gateway.ts', compatibility_date: '2026-07-29', compatibility_flags: ['nodejs_compat'],
    vars: { PORTFOLIO_RUN_ID: runId, OPENRTC_ENVIRONMENT: 'staging', OPENRTC_FIREBASE_PROJECT_ID: PROJECT,
      OPENRTC_LOCAL_EMULATOR: 'true', GATEWAY_SIGNING_SECRET: SIGNING_SECRET, USAGE_INGEST_SECRET: INGEST_SECRET,
      USAGE_INGEST_URL: `${FUNCTIONS_ORIGIN}/ingestCoordinationUsage`, GRANT_SIGNING_PUBLIC_JWKS: JSON.stringify(publicJwks),
      MANAGED_ROOM_FANOUT_MODE: 'off' },
    durable_objects: { bindings: [{ name: 'AVENUES', class_name: 'CoordinationAvenue' }, { name: 'BUDGETS', class_name: 'DeveloperBudget' }] },
    migrations: [{ tag: 'v1', new_sqlite_classes: ['CoordinationAvenue', 'DeveloperBudget'] }],
    ratelimits: canonicalGateway.ratelimits,
  }), { mode: 0o600 });
  log(`runId=${runId} project=${PROJECT} consumer=emulator platform=emulator sdk=${OPENRTC_ROOT}`);
}

async function run(command, args, options = {}) {
  log(`${command} ${args.join(' ')}`);
  const owner = spawnOwned(command, args, {
    cwd: options.cwd ?? PORTFOLIO_ROOT,
    env: { ...localEnv, ...(options.env ?? {}) },
    stdio: 'inherit',
  });
  children.push(owner);
  await owner.close;
  if (owner.error || owner.child.exitCode !== 0) throw owner.error ?? new Error(`${command} failed: ${owner.child.exitCode}`);
}

function sourceFingerprint() {
  const hash = createHash('sha256');
  for (const [root, paths] of [[PORTFOLIO_ROOT, ['app', 'scripts', 'tests', 'package.json', 'pnpm-lock.yaml', 'vite.config.ts', 'playwright.emulator.config.ts']],
    [OPENRTC_ROOT, ['crates/openrtc', 'Cargo.toml', 'Cargo.lock', 'packages/openrtc', 'packages/openrtc-costmodel', 'packages/openrtc-coordination-gateway/src', 'infra/firebase/functions/src', 'pnpm-lock.yaml']]]) {
    const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', ...paths], { cwd: root }).toString().split('\0').filter(Boolean);
    for (const file of [...new Set(files)].sort()) hash.update(root).update(file).update(readFileSync(join(root, file)));
  }
  return hash.digest('hex');
}

async function validateRuntimeArtifacts() {
  const { validateArtifactManifest, canonicalFeatureKey, toolchainIdentity } = await import(pathToFileURL(join(OPENRTC_ROOT, 'scripts/lib/artifact-manifest.mjs')));
  const { openRtcReleaseWasmManifestSpec } = await import(pathToFileURL(join(OPENRTC_ROOT, 'scripts/lib/openrtc-wasm-artifact.mjs')));
  const wasm = validateArtifactManifest(openRtcReleaseWasmManifestSpec(OPENRTC_ROOT));
  if (!wasm.ok) throw new Error(`Build current OpenRTC release WASM first (pnpm --dir packages/openrtc build:wasm): ${wasm.reason}`);
  if (!OPENRTC_TEST_HARNESS) throw new Error('Set OPENRTC_TEST_HARNESS_BIN to the current manifested all-carrier emulator harness.');
  const toolchain = toolchainIdentity();
  const features = ['test-harness', 'transport-moq', 'transport-webrtc'];
  const native = validateArtifactManifest({ manifestPath: `${OPENRTC_TEST_HARNESS}.manifest.json`, kind: 'native',
    target: `native:${toolchain.host}`, features, toolchain, artifactPaths: [OPENRTC_TEST_HARNESS],
    sourceRoots: ['crates/openrtc', 'Cargo.toml', 'Cargo.lock'].map(label => ({ path: join(OPENRTC_ROOT, label), label })),
    buildIdentity: { command: 'cargo build', binary: 'test-harness', profile: 'debug', featureKey: canonicalFeatureKey(features) } });
  if (!native.ok) throw new Error(`OpenRTC emulator native artifact rejected: ${native.reason}`);
}

function assertBundledWasm() {
  const digest = file => createHash('sha256').update(readFileSync(file)).digest('hex');
  const expected = digest(join(OPENRTC_ROOT, 'packages/openrtc/wasm/openrtc_bg.wasm'));
  if (digest(join(OPENRTC_ROOT, 'packages/openrtc/dist/openrtc_bg.wasm')) !== expected) throw new Error('SDK WASM differs from validated source artifact');
  const assets = join(PORTFOLIO_ROOT, 'build/client/assets');
  const bundled = readdirSync(assets).filter(name => /^openrtc_bg.*\.wasm$/.test(name));
  if (bundled.length !== 1 || digest(join(assets, bundled[0])) !== expected) throw new Error('Consumer bundled WASM differs from validated source artifact');
  log(`Validated consumer and SDK WASM SHA-256 ${expected}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function spawnGateway() {
  if (!existsSync(WRANGLER)) throw new Error(`Wrangler is unavailable at ${WRANGLER}`);
  const child = spawnOwned(process.execPath, [
    WRANGLER,
    'dev',
    '--config', join(isolatedConfig, 'wrangler.json'),
    '--local',
    '--ip', '127.0.0.1',
    '--port', String(GATEWAY_PORT),
    '--show-interactive-dev-session=false',
    '--persist-to', join(isolatedConfig, 'gateway'),
  ], { cwd: isolatedConfig, env: localEnv, stdio: 'inherit' });
  children.push(child);
  return child;
}

function spawnIrohRelay() {
  if (!existsSync(OPENRTC_TEST_HARNESS)) {
    throw new Error(`OpenRTC test harness is unavailable at ${OPENRTC_TEST_HARNESS}`);
  }
  const owner = spawnOwned(OPENRTC_TEST_HARNESS, ['--iroh-relay', '--iroh-relay-port', '0'], {
    cwd: join(OPENRTC_ROOT, 'crates', 'openrtc'),
    env: localEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(owner);
  const child = owner.child;

  return new Promise((resolve, reject) => {
    let output = '';
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      reject(new Error('Local Iroh relay did not become ready.'));
    }, 15_000);
    const observe = (chunk) => {
      const text = chunk.toString();
      process.stdout.write(text);
      output = (output + text).slice(-16384);
      const match = output.match(/\[test-iroh-relay\] Listening on (https:\/\/\S+)/);
      if (!match || settled) return;
      settled = true;
      clearTimeout(timer);
      const parsed = new URL(match[1]);
      if (!['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname)) {
        reject(new Error('Owned relay must report loopback HTTPS'));
        return;
      }
      resolve(match[1]);
    };
    child.stdout.on('data', observe);
    child.stderr.on('data', observe);
    child.once('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`Local Iroh relay exited before readiness code=${code} signal=${signal ?? 'none'}.`));
    });
  });
}

function spawnFirebase() {
  const child = spawnOwned('npx', [
    '--yes', FIREBASE_TOOLS,
    'emulators:start',
    '--only', 'functions,firestore,auth,hosting',
    '--project', PROJECT,
    '--config', join(isolatedConfig, 'firebase.json'),
  ], {
    cwd: isolatedConfig,
    env: {
      ...localEnv,
      CLOUDSDK_CONFIG: isolatedConfig,
      GOOGLE_APPLICATION_CREDENTIALS: blockedAdc,
      OPENRTC_USAGE_METERING_MODE: 'enforce',
      OPENRTC_RELAY_ACCOUNTING_MODE: 'external',
      OPENRTC_SIGNING_PRIVATE_JWK: JSON.stringify(privateJwk),
      OPENRTC_COORDINATION_GATEWAY_URL: GATEWAY,
      OPENRTC_EMULATOR_COORDINATION_GATEWAY_SIGNING_SECRET: SIGNING_SECRET,
      OPENRTC_EMULATOR_COORDINATION_USAGE_INGEST_SECRET: INGEST_SECRET,
    },
    stdio: 'inherit',
  });
  children.push(child);
  return child;
}

async function waitForControlPlane(owner) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 120_000) {
    assertAlive(owner);
    try {
      const response = await fetch(`${CONTROL_PLANE}/v2/capabilities`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
        signal: AbortSignal.timeout(1000),
      });
      const body = await response.json();
      if (response.status === 400 && body.error === 'apiKey is invalid.') return;
    } catch {
      // Functions are still loading.
    }
    await sleep(500);
  }
  throw new Error('OpenRTC v2 control plane did not become ready.');
}

function adminServices() {
  const require = createRequire(import.meta.url);
  const admin = require(join(OPENRTC_FIREBASE, 'functions', 'node_modules', 'firebase-admin'));
  process.env.FIRESTORE_EMULATOR_HOST = localEnv.FIRESTORE_EMULATOR_HOST;
  process.env.FIREBASE_AUTH_EMULATOR_HOST = localEnv.FIREBASE_AUTH_EMULATOR_HOST;
  firebaseApp ??= admin.initializeApp({ projectId: PROJECT }, runId);
  return { admin, db: firebaseApp.firestore(), auth: firebaseApp.auth() };
}

async function seedPortfolioApp() {
  const { admin, db } = adminServices();
  const appTag = `app_${API_KEY.slice(-16)}`;
  // Keep Free as the default acceptance gate; explicit internal-tier transport
  // diagnostics never count as evidence for the failing Free budget case.
  await db.collection('developer_accounts').doc(runId).create({ uid: runId, plan: fixturePlan, status: 'active', activeAppCount: 1,
    createdAt: admin.firestore.Timestamp.now(), updatedAt: admin.firestore.Timestamp.now() });
  await db.collection('developer_apps').doc(API_KEY).create({
    apiKey: API_KEY,
    appName: 'Portfolio Cursor Emulator',
    appTag,
    ownerId: runId,
    plan: fixturePlan,
    status: 'active',
    capabilityManifest: {
      schemaVersion: 2,
      avenues: { devices: false, spaces: true, rooms: false, tickets: false },
      accessModes: { capability: true, authenticated: false },
      features: {
        durableMembership: false,
        relay: true,
        managedAttestation: false,
        moq: false,
        ble: false,
        advancedFanout: false,
      },
      allowedOrigins: [`http://127.0.0.1:${ports.web}`],
      identityProviders: [],
      attestationProviders: [],
      attestationPolicy: 'disabled',
      spend: { principalMonthlyCreditCapNanoUsd: 100_000_000_000 },
      safety: {
        maxPeersPerAvenue: 20,
        maxPayloadBytes: 16_384,
        maxMessagesPerMinutePerPrincipal: 1_200,
        maxConcurrentAvenuesPerPrincipal: 2,
      },
    },
    createdAt: admin.firestore.Timestamp.now(),
    updatedAt: admin.firestore.Timestamp.now(),
  });
  await db.collection('registered_app_tags').doc(appTag).create({
    appTag,
    apiKey: API_KEY,
    active: true,
    createdAt: admin.firestore.Timestamp.now(),
  });
}

async function durableStateSnapshot() {
  const { db, auth } = adminServices();
  const [users, legacyRooms, memberships, enrollments] = await Promise.all([
    auth.listUsers(1_000),
    db.collection('rooms').count().get(),
    db.collection('v2_room_memberships').count().get(),
    db.collection('v2_device_enrollments').count().get(),
  ]);
  return {
    authUsers: users.users.length,
    legacyRooms: legacyRooms.data().count,
    roomMemberships: memberships.data().count,
    deviceEnrollments: enrollments.data().count,
  };
}

async function stopChildren() {
  teardownPromise ??= (async () => {
    await Promise.all(children.map(child => stopOwned(child)));
    if (firebaseApp) await firebaseApp.delete();
    rmSync(isolatedConfig, { recursive: true, force: true });
  })();
  return teardownPromise;
}

async function main() {
  const sourceBefore = sourceFingerprint();
  try {
  await validateRuntimeArtifacts();
  await assertPortsFree(Object.values(ports));

  await run('pnpm', ['run', 'build'], { cwd: join(OPENRTC_ROOT, 'packages/openrtc') });
  await run('npm', ['run', 'build'], { cwd: join(OPENRTC_FIREBASE, 'functions') });
  const irohRelayUrl = await spawnIrohRelay();
  prepareLocalConfig();
  const gateway = spawnGateway();
  await waitForIdentity(gateway, `${GATEWAY}/__portfolio_run`, { runId, project: PROJECT }, 30000);
  await waitForIdentity(gateway, `${GATEWAY}/readyz`, { ok: true, environment: 'staging', firebaseProjectId: PROJECT }, 30000);
  const firebase = spawnFirebase();
  await waitForIdentity(firebase, `${CONTROL_PLANE}/__portfolio_run.json`, { runId, project: PROJECT });
  await waitForControlPlane(firebase);
  await seedPortfolioApp();

  const before = await durableStateSnapshot();
  const testingModule = join(OPENRTC_ROOT, 'packages', 'openrtc', 'dist', 'testing.js');
  writeFileSync(testingAlias, [
    `import { OpenRTC as TestingOpenRTC } from ${JSON.stringify(testingModule)};`,
    `if (typeof window !== 'undefined') window.__portfolioHarnessIdentity = ${JSON.stringify({ runId, project: PROJECT, sdkSource: OPENRTC_ROOT, appTag: `app_${API_KEY.slice(-16)}` })};`,
    `export const OpenRTC = (options) => TestingOpenRTC(options, { controlPlane: ${JSON.stringify(CONTROL_PLANE)}, gateway: ${JSON.stringify(GATEWAY)} }, { irohTestRelayUrl: ${JSON.stringify(irohRelayUrl)} });`,
  ].join('\n'));

  const browserEnv = {
    ...(webkitEndpoint ? { PORTFOLIO_WEBKIT_WS_ENDPOINT: webkitEndpoint } : {}),
    VITE_OPENRTC_API_KEY: API_KEY, PORTFOLIO_OPENRTC_TESTING_ALIAS: testingAlias,
    PORTFOLIO_OPENRTC_EMULATOR_API_TARGET: CONTROL_PLANE, PORTFOLIO_E2E_PORT: String(ports.web),
    PORTFOLIO_E2E_RUN_ID: runId,
  };
  await run('pnpm', ['run', 'build'], { env: browserEnv });
  assertBundledWasm();
  await run(join(PORTFOLIO_ROOT, 'node_modules', '.bin', 'playwright'), [
    'test', '-c', 'playwright.emulator.config.ts',
  ], {
    env: browserEnv,
  });

  const after = await durableStateSnapshot();
  if (JSON.stringify(after) !== JSON.stringify(before)) {
    throw new Error(`Portfolio space created durable Auth/room state: before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
  }
  log(`Cursor convergence created no Auth users, rooms, memberships, or enrollments: ${JSON.stringify(after)}`);
  } finally {
    await stopChildren();
    if (sourceFingerprint() !== sourceBefore) throw new Error('Source inputs changed during Portfolio acceptance; evidence is invalid.');
  }
}

process.once('SIGINT', async () => {
  await stopChildren();
  process.exit(130);
});
process.once('SIGTERM', async () => {
  await stopChildren();
  process.exit(143);
});

main()
  .catch((error) => {
    console.error(error?.stack ?? String(error));
    process.exitCode = 1;
  })
  .finally(stopChildren);
