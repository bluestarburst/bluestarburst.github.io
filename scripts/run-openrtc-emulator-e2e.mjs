#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import net from 'node:net';
import {
  ALL_FIREBASE_EMULATOR_PORTS,
  assertEmulatorPortsFree,
  cleanupFirebaseEmulatorPortsSync,
} from '../../plutonium-src/scripts/lib/firebase-emulator-cleanup.mjs';
import { stopChildrenAndWait } from '../../plutonium-src/scripts/lib/tracked-child-process.mjs';

const PORTFOLIO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const WORKSPACE_ROOT = dirname(PORTFOLIO_ROOT);
const OPENRTC_ROOT = join(WORKSPACE_ROOT, 'openrtc');
const OPENRTC_FIREBASE = join(OPENRTC_ROOT, 'infra', 'firebase');
const OPENRTC_GATEWAY = join(OPENRTC_ROOT, 'packages', 'openrtc-coordination-gateway');
const WRANGLER = join(OPENRTC_GATEWAY, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const OPENRTC_TEST_HARNESS = join(
  OPENRTC_ROOT,
  'crates',
  'openrtc',
  'target',
  'test-harness-test-harness_transport-webrtc',
  'debug',
  'test-harness',
);
const CONTROL_PLANE = 'http://127.0.0.1:5004';
const FUNCTIONS_ORIGIN = 'http://127.0.0.1:5002/pluto-rtc-prod/us-central1';
const GATEWAY_PORT = 8787;
const GATEWAY = `http://127.0.0.1:${GATEWAY_PORT}`;
const API_KEY = 'pk_test_1111111111111111111111111111111111111111';
const SIGNING_SECRET = 'portfolio-emulator-signing-secret-0123456789';
const INGEST_SECRET = 'portfolio-emulator-ingest-secret-0123456789';
const FIREBASE_TOOLS = 'firebase-tools@15.19.0';
const children = [];
const isolatedConfig = mkdtempSync(join(tmpdir(), 'portfolio-openrtc-e2e-'));
const blockedAdc = join(isolatedConfig, 'no-production-adc.json');
const testingAlias = join(isolatedConfig, 'openrtc.testing.ts');
let teardownPromise;

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

function run(command, args, options = {}) {
  log(`${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? PORTFOLIO_ROOT,
    env: { ...process.env, ...(options.env ?? {}) },
    stdio: 'inherit',
  });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function portReady(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, 500);
    socket.once('connect', () => {
      clearTimeout(timer);
      socket.end();
      resolve(true);
    });
    socket.once('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

async function waitForPorts(label, ports, timeoutMs = 120_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if ((await Promise.all(ports.map(portReady))).every(Boolean)) {
      log(`${label} ready`);
      return;
    }
    await sleep(500);
  }
  throw new Error(`${label} ports did not become ready: ${ports.join(', ')}`);
}

function cleanupPorts(reason, aggressive = false) {
  cleanupFirebaseEmulatorPortsSync({
    ports: ALL_FIREBASE_EMULATOR_PORTS,
    aggressive,
    forceKnownPorts: true,
    logger: log,
    reason,
  });
}

function spawnGateway() {
  if (!existsSync(WRANGLER)) throw new Error(`Wrangler is unavailable at ${WRANGLER}`);
  const child = spawn(process.execPath, [
    WRANGLER,
    'dev',
    '--env', 'production',
    '--local',
    '--ip', '127.0.0.1',
    '--port', String(GATEWAY_PORT),
    '--show-interactive-dev-session=false',
    '--persist-to', join(isolatedConfig, 'gateway'),
    '--var', `GATEWAY_SIGNING_SECRET:${SIGNING_SECRET}`,
    '--var', `USAGE_INGEST_SECRET:${INGEST_SECRET}`,
    '--var', `USAGE_INGEST_URL:${FUNCTIONS_ORIGIN}/ingestCoordinationUsage`,
    '--var', 'OPENRTC_LOCAL_EMULATOR:true',
    '--var', 'OPENRTC_V2_ENABLED:true',
    '--var', `V2_GRANT_SIGNING_PUBLIC_JWKS:${JSON.stringify(publicJwks)}`,
  ], { cwd: OPENRTC_GATEWAY, env: process.env, stdio: 'inherit' });
  children.push(child);
}

function spawnIrohRelay() {
  if (!existsSync(OPENRTC_TEST_HARNESS)) {
    throw new Error(`OpenRTC test harness is unavailable at ${OPENRTC_TEST_HARNESS}`);
  }
  const child = spawn(OPENRTC_TEST_HARNESS, ['--iroh-relay'], {
    cwd: join(OPENRTC_ROOT, 'crates', 'openrtc'),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);

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
      output += text;
      const match = output.match(/\[test-iroh-relay\] Listening on (https:\/\/\S+)/);
      if (!match || settled) return;
      settled = true;
      clearTimeout(timer);
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
  const child = spawn('npx', [
    '--yes', FIREBASE_TOOLS,
    'emulators:start',
    '--only', 'functions,firestore,auth,hosting:api',
    '--project', 'pluto-rtc-prod',
  ], {
    cwd: OPENRTC_FIREBASE,
    env: {
      ...process.env,
      CLOUDSDK_CONFIG: isolatedConfig,
      GOOGLE_APPLICATION_CREDENTIALS: blockedAdc,
      OPENRTC_USAGE_METERING_MODE: 'enforce',
      OPENRTC_V2_ENABLED: 'true',
      OPENRTC_V2_APP_ALLOWLIST: `app_${API_KEY.slice(-16)}`,
      OPENRTC_V2_SIGNING_PRIVATE_JWK: JSON.stringify(privateJwk),
      OPENRTC_COORDINATION_GATEWAY_URL: GATEWAY,
      OPENRTC_EMULATOR_COORDINATION_GATEWAY_SIGNING_SECRET: SIGNING_SECRET,
      OPENRTC_EMULATOR_COORDINATION_USAGE_INGEST_SECRET: INGEST_SECRET,
    },
    stdio: 'inherit',
  });
  children.push(child);
}

async function waitForControlPlane() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 120_000) {
    try {
      const response = await fetch(`${CONTROL_PLANE}/v2/capabilities`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      if (response.status !== 404) return;
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
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8082';
  process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9100';
  if (admin.apps.length === 0) admin.initializeApp({ projectId: 'pluto-rtc-prod' });
  return { admin, db: admin.firestore(), auth: admin.auth() };
}

async function seedPortfolioApp() {
  const { admin, db } = adminServices();
  const appTag = `app_${API_KEY.slice(-16)}`;
  await db.collection('developer_apps').doc(API_KEY).set({
    apiKey: API_KEY,
    appName: 'Portfolio Cursor Emulator',
    appTag,
    ownerId: 'test_developer',
    plan: 'free',
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
      allowedOrigins: ['http://127.0.0.1:4189'],
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
  }, { merge: true });
  await db.collection('registered_app_tags').doc(appTag).set({
    appTag,
    apiKey: API_KEY,
    active: true,
    createdAt: admin.firestore.Timestamp.now(),
  }, { merge: true });
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
    await stopChildrenAndWait(children, { logger: log });
    cleanupPorts('portfolio OpenRTC emulator teardown', true);
    rmSync(isolatedConfig, { recursive: true, force: true });
  })();
  return teardownPromise;
}

async function main() {
  cleanupPorts('before portfolio OpenRTC emulator E2E', true);
  assertEmulatorPortsFree({
    ports: ALL_FIREBASE_EMULATOR_PORTS,
    message: 'Cannot start Portfolio E2E because Firebase emulator ports are occupied.',
  });
  if (await portReady(GATEWAY_PORT)) throw new Error(`Gateway port ${GATEWAY_PORT} is occupied.`);

  run('npm', ['run', 'build'], { cwd: join(OPENRTC_FIREBASE, 'functions') });
  const irohRelayUrl = await spawnIrohRelay();
  spawnGateway();
  await waitForPorts('coordination gateway', [GATEWAY_PORT], 30_000);
  spawnFirebase();
  await waitForPorts('OpenRTC emulators', [5002, 5004, 8082, 9100]);
  await waitForControlPlane();
  run(process.execPath, [join(OPENRTC_ROOT, 'tests', 'emulator', 'seed-integration-emulator.mjs'), '--reset'], {
    env: { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8082' },
  });
  await seedPortfolioApp();

  const before = await durableStateSnapshot();
  const testingModule = pathToFileURL(join(OPENRTC_ROOT, 'packages', 'openrtc', 'src', 'testing.ts')).href;
  writeFileSync(testingAlias, [
    `import { createTestingOpenRTC } from ${JSON.stringify(testingModule)};`,
    `export const OpenRTC = (options) => createTestingOpenRTC(options, { controlPlane: ${JSON.stringify(CONTROL_PLANE)}, gateway: ${JSON.stringify(GATEWAY)} }, { irohTestRelayUrl: ${JSON.stringify(irohRelayUrl)} });`,
  ].join('\n'));

  run(join(PORTFOLIO_ROOT, 'node_modules', '.bin', 'playwright'), [
    'test', '-c', 'playwright.emulator.config.ts',
  ], {
    env: {
      VITE_OPENRTC_API_KEY: API_KEY,
      PORTFOLIO_OPENRTC_TESTING_ALIAS: testingAlias,
      PORTFOLIO_OPENRTC_EMULATOR_API_TARGET: CONTROL_PLANE,
    },
  });

  const after = await durableStateSnapshot();
  if (JSON.stringify(after) !== JSON.stringify(before)) {
    throw new Error(`Portfolio space created durable Auth/room state: before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
  }
  log(`Cursor convergence created no Auth users, rooms, memberships, or enrollments: ${JSON.stringify(after)}`);
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
