/**
 * Pure live-space sharding for the public cursor demo. Unlike the retired
 * room flow, joining a shard never creates durable membership or an Auth user.
 */

export const SPACE_PREFIX = 'portfolio-cursors';
// 4,096 available slots leave placement headroom for the 2,000-participant
// acceptance burst. Unused shard names do not open an avenue.
export const SPACE_SHARDS = 512;
export const MAX_SPACE_PROBES = 16;

export function cursorErrorStatus(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  switch (code) {
    case 'turnstile-required':
    case 'turnstile-rejected':
    case 'turnstile-unavailable': return 'Cursor verification unavailable';
    case 'credit-exhausted': return 'Account credits exhausted';
    case 'app-budget-exhausted': return 'Cursor app budget exhausted';
    case 'app-rate-limited': return 'Cursor app temporarily rate limited';
    case 'principal-rate-limited': return 'Your cursor session is temporarily rate limited';
    case 'edge-rate-limited': return 'Network temporarily rate limited';
    case 'provider-safety-paused': return 'Cursor service temporarily paused';
    case 'usage-price-stale': return 'Please reload to update cursor pricing';
    case 'relay-budget-exhausted': return 'Cursor relay budget exhausted';
    case 'room-capacity-exceeded': return 'No available cursor space found';
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
 * Prefer one shared space, then spread overflow without scanning the whole pool.
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
  // Ordinary visitors meet in shard zero. Only an authoritative capacity denial
  // enables overflow; randomizing the initial attempt would isolate light traffic.
  const startShard = options.startShard ?? 0;
  // OpenRTC 2.0 RC spaces admit eight peers by default. More than eight is an
  // operator-reviewed capability, so the public cursor demo scales through
  // bounded shards instead of silently requesting advanced fan-out.
  const maxPeers = options.maxPeers ?? 8;
  if (!Number.isInteger(shards) || shards < 1 || shards > SPACE_SHARDS) throw new Error(`Cursor shards must be between 1 and ${SPACE_SHARDS}.`);
  if (!Number.isInteger(startShard) || startShard < 0 || startShard >= shards) throw new Error('Starting cursor shard is out of range.');

  let lastError: unknown = null;
  let overflowOffset = 1;
  for (let attempt = 0; attempt < Math.min(shards, MAX_SPACE_PROBES); attempt += 1) {
    // Permute the other shards without repetition. Explicit starting points keep
    // their deterministic order for callers; the shipping default spreads load.
    if (attempt === 1 && options.startShard === undefined) {
      overflowOffset = 1 + Math.floor(Math.random() * (shards - 1));
    }
    const offset = attempt === 0 ? 0 : 1 + (overflowOffset + attempt - 2) % (shards - 1);
    const shard = (startShard + offset) % shards;
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

  throw lastError ?? new Error('No available shared cursor space found.');
}
