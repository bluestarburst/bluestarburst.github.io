import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  getSpaceId,
  isSpaceFullError,
  joinAvailableSpace,
  SPACE_PREFIX,
  type SpaceClientLike,
} from './sharedCursorsRooms';

type Space = { id: string };

function mockClient(join: SpaceClientLike<Space>['spaces']['join']): SpaceClientLike<Space> {
  return { spaces: { join } };
}

describe('cursor capability-space sharding', () => {
  it('keeps public cursor peers in the manifest-gated relay privacy path', () => {
    const component = readFileSync(
      new URL('./SharedCursors.tsx', import.meta.url),
      'utf8',
    );
    expect(component).toContain('relay: true');
    expect(component).toContain("privacy: 'relay-only'");
    expect(component).toContain("priority: ['webrtc', 'iroh']");
  });

  it('uses the current v2 space projection without taking over peer lifecycle', () => {
    const component = readFileSync(
      new URL('./SharedCursors.tsx', import.meta.url),
      'utf8',
    );
    expect(component).toContain('space.diagnostics.connections().forEach');
    expect(component).toContain('latestCursorPayloadRef');
    expect(component).not.toContain('connectionsRef');
    expect(component).not.toContain('.disconnect()');
  });

  it('formats bounded live-space shard IDs', () => {
    expect(getSpaceId(0)).toBe(`${SPACE_PREFIX}-0`);
    expect(getSpaceId(11)).toBe(`${SPACE_PREFIX}-11`);
    expect(() => getSpaceId(-1)).toThrow(/non-negative/);
  });

  it('classifies only capacity and budget admission failures as shard-full', () => {
    expect(isSpaceFullError(new Error('space is full'))).toBe(true);
    expect(isSpaceFullError(new Error('budget-exhausted'))).toBe(true);
    expect(isSpaceFullError(new Error('HTTP 429'))).toBe(true);
    expect(isSpaceFullError(new Error('unauthorized'))).toBe(false);
  });

  it('joins one ephemeral latest-state capability space', async () => {
    const join = vi.fn(async (id: string) => ({ id }));
    const result = await joinAvailableSpace(mockClient(join), {
      prefix: 'cursor',
      shards: 4,
      startShard: 2,
      maxPeers: 16,
    });
    expect(result).toEqual({ spaceId: 'cursor-2', space: { id: 'cursor-2' } });
    expect(join).toHaveBeenCalledWith('cursor-2', {
      access: 'capability',
      identity: 'ephemeral',
      payload: 'latest-state',
      maxPeers: 16,
    });
  });

  it('starts at the first shard so contemporaneous visitors share one avenue', async () => {
    const join = vi.fn(async (id: string) => ({ id }));
    const result = await joinAvailableSpace(mockClient(join), { shards: 4 });
    expect(result.spaceId).toBe('portfolio-cursors-0');
    expect(join).toHaveBeenCalledTimes(1);
    expect(join).toHaveBeenCalledWith('portfolio-cursors-0', expect.objectContaining({ maxPeers: 8 }));
  });

  it('walks to the next shard after a bounded capacity denial', async () => {
    const join = vi.fn()
      .mockRejectedValueOnce(new Error('space is full'))
      .mockResolvedValueOnce({ id: 'cursor-0' });
    const result = await joinAvailableSpace(mockClient(join), {
      prefix: 'cursor',
      shards: 3,
      startShard: 2,
    });
    expect(result.spaceId).toBe('cursor-0');
    expect(join).toHaveBeenCalledTimes(2);
  });

  it('fails immediately on trust errors and after all shards are full', async () => {
    const denied = vi.fn(async () => { throw new Error('unauthorized'); });
    await expect(joinAvailableSpace(mockClient(denied), { shards: 4, startShard: 0 }))
      .rejects.toThrow('unauthorized');
    expect(denied).toHaveBeenCalledTimes(1);

    const full = vi.fn(async () => { throw new Error('resource-exhausted'); });
    await expect(joinAvailableSpace(mockClient(full), { shards: 3, startShard: 0 }))
      .rejects.toThrow('resource-exhausted');
    expect(full).toHaveBeenCalledTimes(3);
  });
});
