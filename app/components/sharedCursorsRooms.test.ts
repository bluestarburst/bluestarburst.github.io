import { describe, expect, it, vi } from 'vitest';
import {
  getRoomId,
  isRoomExistsError,
  isRoomFullError,
  isRoomNotFoundError,
  joinAvailableRoom,
  joinOrCreateRoomOnce,
  ROOM_PREFIX,
  type RoomClientLike,
} from './sharedCursorsRooms';

type Conn = { id: string };

function mockClient(overrides: Partial<RoomClientLike<Conn>> = {}): RoomClientLike<Conn> {
  return {
    joinRoom: vi.fn(async () => [] as Conn[]),
    createRoom: vi.fn(async () => 'room'),
    ...overrides,
  };
}

describe('getRoomId', () => {
  it('formats the shard with the default prefix', () => {
    expect(getRoomId(0)).toBe(`${ROOM_PREFIX}-0`);
    expect(getRoomId(11)).toBe(`${ROOM_PREFIX}-11`);
  });

  it('honours a custom prefix', () => {
    expect(getRoomId(3, 'TEST')).toBe('TEST-3');
  });
});

describe('error classifiers', () => {
  it('detects not-found errors', () => {
    expect(isRoomNotFoundError(new Error('Room not found'))).toBe(true);
    expect(isRoomNotFoundError(new Error('HTTP 404'))).toBe(true);
    expect(isRoomNotFoundError(new Error('room is full'))).toBe(false);
  });

  it('detects already-exists errors', () => {
    expect(isRoomExistsError(new Error('Room already exists'))).toBe(true);
    expect(isRoomExistsError('409 conflict')).toBe(true);
    expect(isRoomExistsError(new Error('nope'))).toBe(false);
  });

  it('detects room-full errors including the members form', () => {
    expect(isRoomFullError(new Error('room is full'))).toBe(true);
    expect(isRoomFullError(new Error('resource-exhausted'))).toBe(true);
    expect(isRoomFullError(new Error('429 too many'))).toBe(true);
    expect(isRoomFullError(new Error('full (8/8 members)'))).toBe(true);
    expect(isRoomFullError(new Error('room not found'))).toBe(false);
  });
});

describe('joinOrCreateRoomOnce', () => {
  it('joins an existing room directly', async () => {
    const conns = [{ id: 'a' }];
    const client = mockClient({ joinRoom: vi.fn(async () => conns) });
    await expect(joinOrCreateRoomOnce(client, 'r')).resolves.toBe(conns);
    expect(client.createRoom).not.toHaveBeenCalled();
    expect(client.joinRoom).toHaveBeenCalledWith('r', { bootstrapPeers: false });
  });

  it('creates then joins when the room does not exist', async () => {
    const conns = [{ id: 'b' }];
    const joinRoom = vi
      .fn<RoomClientLike<Conn>['joinRoom']>()
      .mockRejectedValueOnce(new Error('room not found'))
      .mockResolvedValueOnce(conns);
    const client = mockClient({ joinRoom });
    await expect(joinOrCreateRoomOnce(client, 'r')).resolves.toBe(conns);
    expect(client.createRoom).toHaveBeenCalledWith('r');
    expect(joinRoom).toHaveBeenCalledTimes(2);
  });

  it('tolerates a concurrent create (already exists) and still joins', async () => {
    const conns = [{ id: 'c' }];
    const joinRoom = vi
      .fn<RoomClientLike<Conn>['joinRoom']>()
      .mockRejectedValueOnce(new Error('not found'))
      .mockResolvedValueOnce(conns);
    const createRoom = vi.fn(async () => {
      throw new Error('Room already exists');
    });
    const client = mockClient({ joinRoom, createRoom });
    await expect(joinOrCreateRoomOnce(client, 'r')).resolves.toBe(conns);
    expect(joinRoom).toHaveBeenCalledTimes(2);
  });

  it('rethrows a non-not-found join error without creating', async () => {
    const client = mockClient({
      joinRoom: vi.fn(async () => {
        throw new Error('boom');
      }),
    });
    await expect(joinOrCreateRoomOnce(client, 'r')).rejects.toThrow('boom');
    expect(client.createRoom).not.toHaveBeenCalled();
  });
});

describe('joinAvailableRoom', () => {
  it('returns the first room with capacity', async () => {
    const conns = [{ id: 'x' }];
    const client = mockClient({ joinRoom: vi.fn(async () => conns) });
    const result = await joinAvailableRoom(client, { shards: 4, prefix: 'P' });
    expect(result).toEqual({ roomId: 'P-0', connections: conns });
  });

  it('skips full rooms and joins the next available shard', async () => {
    const conns = [{ id: 'y' }];
    const joinRoom = vi
      .fn<RoomClientLike<Conn>['joinRoom']>()
      .mockRejectedValueOnce(new Error('room is full'))
      .mockRejectedValueOnce(new Error('full (8/8 members)'))
      .mockResolvedValueOnce(conns);
    const client = mockClient({ joinRoom });
    const result = await joinAvailableRoom(client, { shards: 5, prefix: 'P' });
    expect(result).toEqual({ roomId: 'P-2', connections: conns });
    expect(joinRoom).toHaveBeenCalledTimes(3);
  });

  it('throws when every shard is full', async () => {
    const client = mockClient({
      joinRoom: vi.fn(async () => {
        throw new Error('room is full');
      }),
    });
    await expect(joinAvailableRoom(client, { shards: 3 })).rejects.toThrow(/full/i);
  });

  it('aborts immediately on a non-full error', async () => {
    const joinRoom = vi.fn(async () => {
      throw new Error('unauthorized');
    });
    const client = mockClient({ joinRoom });
    await expect(joinAvailableRoom(client, { shards: 6 })).rejects.toThrow('unauthorized');
    expect(joinRoom).toHaveBeenCalledTimes(1);
  });
});
