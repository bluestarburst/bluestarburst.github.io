import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  getSpaceId,
  cursorErrorStatus,
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
  it('renders safe actionable billing labels instead of hiding errors behind a cursor count', () => {
    expect(cursorErrorStatus({ code: 'credit-exhausted' })).toBe('Account credits exhausted');
    expect(cursorErrorStatus({ code: 'app-rate-limited' })).toBe('Cursor app temporarily rate limited');
    expect(cursorErrorStatus({ code: 'room-capacity-exceeded' })).toBe('All cursor spaces are full');
    expect(cursorErrorStatus(new Error('private credential material'))).toBe('Cursor connection failed');
  });
  it('keeps public cursor addresses private with the SDK relay-only policy', () => {
    const component = readFileSync(
      new URL('./SharedCursors.tsx', import.meta.url),
      'utf8',
    );
    expect(component).toContain('iroh: true');
    expect(component).toContain('webrtc: true');
    expect(component).toContain("privacy: 'relay-only'");
    expect(component).toContain('relay: true');
  });

  it('uses latest-state without taking over peer lifecycle', () => {
    const component = readFileSync(
      new URL('./SharedCursors.tsx', import.meta.url),
      'utf8',
    );
    expect(component).toContain("space.state<CursorPosition>('cursor')");
    expect(component).toContain('cursorState.watch');
    expect(component).toContain('space.onConnection');
    expect(component).not.toContain('space.diagnostics');
    expect(component).not.toContain('.disconnect()');
  });

  it('formats bounded live-space shard IDs', () => {
    expect(getSpaceId(0)).toBe(`${SPACE_PREFIX}-0`);
    expect(getSpaceId(11)).toBe(`${SPACE_PREFIX}-11`);
    expect(() => getSpaceId(-1)).toThrow(/non-negative/);
  });

  it('classifies only explicit room capacity as shard-full', () => {
    expect(isSpaceFullError(new Error('space is full'))).toBe(true);
    expect(isSpaceFullError({ code: 'room-capacity-exceeded' })).toBe(true);
    expect(isSpaceFullError(new Error('budget-exhausted'))).toBe(false);
    expect(isSpaceFullError(new Error('HTTP 429'))).toBe(false);
    expect(isSpaceFullError(new Error('unauthorized'))).toBe(false);
  });

  it.each([
    'credit-exhausted', 'app-budget-exhausted', 'app-rate-limited',
    'principal-rate-limited', 'edge-rate-limited', 'provider-safety-paused',
    'usage-price-stale', 'relay-budget-exhausted', 'resource-exhausted',
  ])('does not multiply admission requests after %s', async (code) => {
    const error = Object.assign(new Error('space is full'), { code, retryable: false });
    const join = vi.fn(async (_id: string) => { throw error; });
    await expect(joinAvailableSpace(mockClient(join))).rejects.toBe(error);
    expect(join).toHaveBeenCalledTimes(1);
  });

  it('bounds explicit room-capacity-exceeded at the twelve configured shards', async () => {
    const error = Object.assign(new Error('capacity denied'), { code: 'room-capacity-exceeded' });
    const join = vi.fn(async (_id: string) => { throw error; });
    await expect(joinAvailableSpace(mockClient(join))).rejects.toBe(error);
    expect(join).toHaveBeenCalledTimes(12);
    expect(new Set(join.mock.calls.map(([id]) => id)).size).toBe(12);
  });

  it('joins one session latest-state capability space', async () => {
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
      identity: 'session',
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

    const full = vi.fn(async () => { throw new Error('space is full'); });
    await expect(joinAvailableSpace(mockClient(full), { shards: 3, startShard: 0 }))
      .rejects.toThrow('space is full');
    expect(full).toHaveBeenCalledTimes(3);
  });
});
