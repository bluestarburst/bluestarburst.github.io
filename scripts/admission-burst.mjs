import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto';

// Protocol admission evidence only: no Iroh endpoint, payload delivery or SDK
// lifecycle is simulated. The existing runner owns services, funding and cleanup.
export async function admissionBurst({ controlPlane, gateway, apiKey, origin, runId, diagnostics }) {
  for (const url of [controlPlane, gateway, origin]) {
    assert.equal(new URL(url).hostname, '127.0.0.1', 'Admission probe must remain loopback');
  }
  const sockets = [];
  const results = [];
  const claims = token => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
  const hash = value => createHash('sha256').update(value).digest('base64url');
  async function post(path, body) {
    const response = await fetch(`${controlPlane}${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify({ ...body, idempotencyKey: randomUUID() }), signal: AbortSignal.timeout(30000),
    });
    const value = await response.json();
    if (!response.ok) throw new Error(JSON.stringify({ path, status: response.status,
      code: value.code, scope: value.scope, operation: value.operation }));
    return value;
  }
  async function connect(index) {
    const key = generateKeyPairSync('ed25519');
    const avenue = { kind: 'space', id: `burst-${runId}-${Math.floor(index / 8)}` };
    const proof = parts => {
      const nonce = randomUUID().replaceAll('-', '');
      const issuedAt = Math.floor(Date.now() / 1000);
      return { publicKeyJwk: key.publicKey.export({ format: 'jwk' }), nonce, issuedAt,
        signature: sign(null, Buffer.from([...parts, nonce, issuedAt].join(':')), key.privateKey).toString('base64url') };
    };
    const capability = await post('/v2/capabilities', { apiKey, avenue, maxPeers: 8,
      deviceProof: proof(['openrtc:v2:capability', apiKey, avenue.kind, avenue.id]) });
    const runtimeInstanceId = randomUUID();
    const ticket = `admission-only-${runId}-${index}`;
    const grant = await post('/v2/gateway/grants', { apiKey, avenue, credentialType: 'capability',
      credential: capability.capability, runtimeInstanceId, ticketFingerprint: hash(ticket),
      maxPeers: 8, features: { irohRelay: true, managedTurn: false, moq: false,
        ble: false, advancedFanout: false, durableMembership: false },
      deviceProof: proof(['openrtc:v2:gateway-grant', claims(capability.capability).jti,
        avenue.kind, avenue.id, runtimeInstanceId]) });
    assert.equal(new URL(grant.gatewayUrl).origin, new URL(gateway).origin);
    assert.equal(grant.maxPeers, 8);
    const url = new URL(`/v2/connect/${grant.routeKey}`, gateway);
    url.protocol = 'ws:';
    const socket = new WebSocket(url, ['openrtc.v2', `openrtc.auth.${grant.token}`]);
    sockets.push(socket);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Gateway ready deadline exceeded')), 30000);
      const finish = error => { clearTimeout(timer); error ? reject(error) : resolve(); };
      socket.onopen = () => socket.send(JSON.stringify({ v: 1, type: 'auth', token: grant.token,
        socketLiveness: 'ping-v1', device: { deviceId: claims(grant.token).deviceId,
          runtimeInstanceId, nodeId: hash(ticket), ticket, deviceName: 'Admission probe',
          platformType: 'web', online: true } }));
      socket.onmessage = event => {
        const frame = JSON.parse(String(event.data));
        if (frame.type === 'ready') finish();
        if (frame.type === 'error') {
          // Retain the owning failure seam, never arbitrary server text or a
          // credential-bearing frame. These labels distinguish renewal causes
          // that otherwise collapse into the same public compatibility code.
          const renewalCause = frame.code === 'budget-renewal-required'
            ? new Map([
              ['The active connection has no renewable budget authority.', 'missing-authority'],
              ['The active connection could not register its budget authority.', 'authority-registration'],
              ['Connection authentication exceeds the remaining provider escrow.', 'authentication-escrow'],
            ]).get(frame.message) ?? 'unclassified'
            : undefined;
          finish(new Error(JSON.stringify({ code: frame.code, scope: frame.scope,
            renewalCause })));
        }
      };
      socket.onerror = () => finish(new Error('Gateway socket error'));
      socket.onclose = event => finish(new Error(`Gateway closed ${event.code}`));
    });
  }
  try {
    // Eight concurrent issuances; all admitted sockets remain open until every
    // principal has attempted admission. No retries or intermediate hold release.
    for (let start = 0; start < 100; start += 8) {
      results.push(...await Promise.allSettled(Array.from({ length: Math.min(8, 100 - start) },
        (_, offset) => connect(start + offset))));
    }
    const denied = results.filter(result => result.status === 'rejected').map(result => String(result.reason));
    const report = { attempted: results.length, admitted: results.length - denied.length,
      stillOpen: sockets.filter(socket => socket.readyState === WebSocket.OPEN).length,
      distinctDenials: [...new Set(denied)] };
    console.log(`[portfolio-admission-burst] ${JSON.stringify(report)}`);
    if (diagnostics) console.log(`[portfolio-admission-budget] ${JSON.stringify(await diagnostics())}`);
    assert.equal(report.admitted, 100, 'Every funded burst participant must be admitted');
    assert.equal(report.stillOpen, 100, 'All admitted sockets must remain open');
  } finally {
    await Promise.all(sockets.map(socket => new Promise(resolve => {
      if (socket.readyState === WebSocket.CLOSED) return resolve();
      const timer = setTimeout(resolve, 5000);
      socket.addEventListener('close', () => { clearTimeout(timer); resolve(); }, { once: true });
      socket.close(1000, 'admission probe complete');
    })));
  }
}
