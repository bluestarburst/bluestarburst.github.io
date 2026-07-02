/**
 * Pure room-selection logic for the shared-cursors demo.
 *
 * Extracted from `SharedCursors.tsx` so the sharding / join-or-create / retry
 * behaviour can be unit-tested without a live OpenRTC client. The component
 * injects the real `OpenRTCClient` (which structurally satisfies
 * `RoomClientLike`); tests inject a mock.
 */

export const ROOM_PREFIX = 'PORTFOLIO-CURSORS';
export const ROOM_SHARDS = 12;

/** Minimal slice of the OpenRTC client this module needs. */
export interface RoomClientLike<C> {
  joinRoom(roomId: string, options?: { bootstrapPeers?: boolean }): Promise<C[]>;
  createRoom(roomId: string): Promise<string>;
}

export function getRoomId(shard: number, prefix: string = ROOM_PREFIX): string {
  return `${prefix}-${shard}`;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isRoomNotFoundError(error: unknown): boolean {
  return /room not found|not found|404/i.test(messageOf(error));
}

export function isRoomExistsError(error: unknown): boolean {
  return /already exists|409/i.test(messageOf(error));
}

export function isRoomFullError(error: unknown): boolean {
  const message = messageOf(error);
  return /room is full|resource-exhausted|429/i.test(message) || /full \(\d+\/\d+ members\)/i.test(message);
}

/**
 * Join a room, creating it first if it does not exist yet. A concurrent create
 * (another peer won the race) is treated as success.
 */
export async function joinOrCreateRoomOnce<C>(client: RoomClientLike<C>, roomId: string): Promise<C[]> {
  try {
    return await client.joinRoom(roomId, { bootstrapPeers: false });
  } catch (joinError) {
    if (!isRoomNotFoundError(joinError)) {
      throw joinError;
    }

    try {
      await client.createRoom(roomId);
    } catch (createError) {
      if (!isRoomExistsError(createError)) {
        throw createError;
      }
    }

    return client.joinRoom(roomId, { bootstrapPeers: false });
  }
}

/**
 * Walk the room shards, joining the first one that has capacity. Full rooms are
 * skipped; any other error aborts immediately.
 */
export async function joinAvailableRoom<C>(
  client: RoomClientLike<C>,
  options: { shards?: number; prefix?: string } = {},
): Promise<{ roomId: string; connections: C[] }> {
  const shards = options.shards ?? ROOM_SHARDS;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < shards; attempt += 1) {
    const roomId = getRoomId(attempt, options.prefix);

    try {
      const connections = await joinOrCreateRoomOnce(client, roomId);
      return { roomId, connections };
    } catch (error) {
      lastError = error;
      if (!isRoomFullError(error)) {
        throw error;
      }
    }
  }

  throw lastError ?? new Error('All shared cursor rooms are full.');
}
