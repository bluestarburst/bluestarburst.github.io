import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { joinAvailableSpace, SPACE_SHARDS, MAX_SPACE_PROBES, type SpaceClientLike } from './sharedCursorsRooms';

type Space = { id: string; leave(): Promise<void> };

/** Only runtime capacity admission is mocked. Production shard selection and
 * options execute unchanged. This is not transport, token, grant or invoice proof. */
function capacityRuntime() {
  const members = new Map<string, Set<string>>();
  let attempts = 0, capacityDenials = 0;
  const principalAttempts = new Map<string, number>();
  const observedPeerBounds = new Set<number>();
  function client(principal: string): SpaceClientLike<Space> {
    return { spaces: { async join(id, options) {
      attempts++; observedPeerBounds.add(options.maxPeers);
      principalAttempts.set(principal, (principalAttempts.get(principal) ?? 0) + 1);
      expect(options).toMatchObject({ access: 'capability', identity: 'session', payload: 'latest-state' });
      const present = members.get(id) ?? new Set<string>();
      if (present.size >= options.maxPeers) {
        capacityDenials++;
        throw Object.assign(new Error('Authoritative space capacity exceeded'), { code: 'room-capacity-exceeded' });
      }
      present.add(principal); members.set(id, present);
      return { id, async leave() { present.delete(principal); } };
    } } };
  }
  return { client, members, observedPeerBounds, principalAttempts, counters: () => ({ attempts, capacityDenials }) };
}

async function thousandVisits(options?: Parameters<typeof joinAvailableSpace>[1]) {
  const runtime = capacityRuntime();
  const active: { expiresAt: number; space: Space }[] = [];
  let admitted = 0, denied = 0, peakRequested = 0;
  // Every visit contains two concurrent participants and lasts five minutes.
  // 1000 visits arrive in [0,300s), so all2000 overlap before the first exit.
  for (let visit = 0; visit < 1000; visit++) {
    const arrival = visit * 300;
    for (const record of active.filter(record => record.expiresAt <= arrival)) await record.space.leave();
    for (let participant = 0; participant < 2; participant++) {
      peakRequested++;
      try {
        const joined = await joinAvailableSpace(runtime.client(`visit-${visit}-participant-${participant}`), options);
        admitted++; active.push({ expiresAt: arrival + 300000, space: joined.space });
      } catch (error) {
        expect(error).toMatchObject({ code: 'room-capacity-exceeded' }); denied++;
      }
    }
  }
  const peakAdmitted = [...runtime.members.values()].reduce((sum, peers) => sum + peers.size, 0);
  for (const record of active) await record.space.leave();
  expect([...runtime.members.values()].every(peers => peers.size === 0)).toBe(true);
  return { admitted, denied, peakRequested, peakAdmitted, ...runtime.counters(),
    maxProbes: Math.max(...runtime.principalAttempts.values()), peerBounds: [...runtime.observedPeerBounds] };
}

describe('shipping shared-cursor workload characterization, not network acceptance', () => {
  it('binds this fixture to the actual SharedCursors default configuration', () => {
    const component = readFileSync(new URL('./SharedCursors.tsx', import.meta.url), 'utf8');
    expect(component).toMatch(/await joinAvailableSpace\(client\);/);
    expect(SPACE_SHARDS).toBe(512);
    expect(MAX_SPACE_PROBES).toBe(16);
  });

  it('places two independent ordinary visitors together in one probe each', async () => {
    const runtime = capacityRuntime();
    const chromium = await joinAvailableSpace(runtime.client('chromium-session'));
    const firefox = await joinAvailableSpace(runtime.client('firefox-session'));
    expect(chromium.spaceId).toBe(firefox.spaceId);
    expect(runtime.members.get(chromium.spaceId)?.size).toBe(2);
    expect(runtime.counters()).toEqual({ attempts: 2, capacityDenials: 0 });
    // Names model independent callers only. No BroadcastChannel or real browser
    // transport participates, so this assertion establishes placement only.
  });

  it.each([1, 7, 42, 12345, 2147483647])('admits the overlap burst with bounded probes (seed %i)', async (seed) => {
    let state = seed;
    const random = vi.spyOn(Math, 'random').mockImplementation(() => {
      state = (Math.imul(1664525, state) + 1013904223) >>> 0;
      return state / 0x100000000;
    });
    try {
      const measured = await thousandVisits();
      expect(measured).toMatchObject({ admitted: 2000, denied: 0, peakRequested: 2000,
        peakAdmitted: 2000, peerBounds: [8] });
      expect(measured.maxProbes).toBeLessThanOrEqual(MAX_SPACE_PROBES);
      // At most three join attempts per participant on average, including the
      // deliberate primary-space probe; no 125-probe full-prefix scan.
      expect(measured.attempts).toBeLessThanOrEqual(6000);
      expect(measured.capacityDenials).toBe(measured.attempts - measured.admitted);
    } finally { random.mockRestore(); }
  });
});
