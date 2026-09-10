/**
 * Pure live-space sharding for the public cursor demo. Unlike the retired
 * room flow, joining a shard never creates durable membership or an Auth user.
 */

export const SPACE_PREFIX = 'portfolio-cursors';
export const SPACE_SHARDS = 12;

export function cursorErrorStatus(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  switch (code) {
    case 'credit-exhausted': return 'Account credits exhausted';
    case 'app-budget-exhausted': return 'Cursor app budget exhausted';
    case 'app-rate-limited': return 'Cursor app temporarily rate limited';
    case 'principal-rate-limited': return 'Your cursor session is temporarily rate limited';
    case 'edge-rate-limited': return 'Network temporarily rate limited';
    case 'provider-safety-paused': return 'Cursor service temporarily paused';
    case 'usage-price-stale': return 'Please reload to update cursor pricing';
    case 'relay-budget-exhausted': return 'Cursor relay budget exhausted';
    case 'room-capacity-exceeded': return 'All cursor spaces are full';
    default: return 'Cursor connection failed';
  }
}

export interface SpaceClientLike<S> {
  spaces: {
    join(
      id: string,
      options: {
        access: 'capability';
        identity: 'session';
        payload: 'latest-state';
        maxPeers: number;
      },
    ): Promise<S>;
  };
}

export function getSpaceId(shard: number, prefix: string = SPACE_PREFIX): string {
  if (!Number.isInteger(shard) || shard < 0) throw new Error('Space shard must be a non-negative integer.');
  return `${prefix}-${shard}`;
}

export function isSpaceFullError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'code' in error) {
    return error.code === 'room-capacity-exceeded';
  }
  const message = error instanceof Error ? error.message : String(error);
  return /^(?:\[OpenRTC\] )?(?:space is full|room is full|room-capacity-exceeded)[.!]?$/i.test(message);
}

/**
 * Walk live-only capability shards from a caller-selected starting point.
 * The server remains authoritative for capacity and budget admission.
 */
export async function joinAvailableSpace<S>(
  client: SpaceClientLike<S>,
  options: {
    shards?: number;
    prefix?: string;
    startShard?: number;
    maxPeers?: number;
  } = {},
): Promise<{ spaceId: string; space: S }> {
  const shards = options.shards ?? SPACE_SHARDS;
  // Fill shards in a stable order so visitors who arrive together actually
  // share a cursor space. Random starts silently partitioned otherwise healthy
  // visitors across different avenues and multiplied idle coordination state.
  const startShard = options.startShard ?? 0;
  // OpenRTC 2.0 RC spaces admit eight peers by default. More than eight is an
  // operator-reviewed capability, so the public cursor demo scales through
  // bounded shards instead of silently requesting advanced fan-out.
  const maxPeers = options.maxPeers ?? 8;
  if (!Number.isInteger(shards) || shards < 1) throw new Error('At least one cursor shard is required.');

  let lastError: unknown = null;
  for (let attempt = 0; attempt < shards; attempt += 1) {
    const shard = (startShard + attempt) % shards;
    const spaceId = getSpaceId(shard, options.prefix);
    try {
      const space = await client.spaces.join(spaceId, {
        access: 'capability',
        identity: 'session',
        payload: 'latest-state',
        maxPeers,
      });
      return { spaceId, space };
    } catch (error) {
      lastError = error;
      if (!isSpaceFullError(error)) throw error;
    }
  }

  throw lastError ?? new Error('All shared cursor spaces are full.');
}
