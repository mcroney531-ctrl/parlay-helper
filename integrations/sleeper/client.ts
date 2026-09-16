import type { SleeperPlayer, SleeperSnapshot } from "./types";

const SLEEPER_PLAYERS_URL = "https://api.sleeper.app/v1/players/nfl";
const SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000; // ~once per day, per the handoff
const FETCH_TIMEOUT_MS = 15_000;

type RawSleeperPlayer = {
  player_id?: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  team?: string | null;
  position?: string | null;
  status?: string | null;
  depth_chart_position?: string | null;
};

let snapshot: SleeperSnapshot | null = null;
let inFlightFetch: Promise<SleeperSnapshot> | null = null;

function normalize(raw: Record<string, RawSleeperPlayer>): Record<string, SleeperPlayer> {
  const players: Record<string, SleeperPlayer> = {};
  for (const [id, p] of Object.entries(raw)) {
    players[id] = {
      playerId: id,
      fullName: p.full_name ?? ([p.first_name, p.last_name].filter(Boolean).join(" ") || id),
      team: p.team ?? null,
      position: p.position ?? null,
      status: p.status ?? null,
      depthChartPosition: p.depth_chart_position ?? null,
    };
  }
  return players;
}

async function fetchFreshSnapshot(): Promise<SleeperSnapshot> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(SLEEPER_PLAYERS_URL, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Sleeper responded with ${response.status}`);
    }
    const raw = (await response.json()) as Record<string, RawSleeperPlayer>;
    const fresh: SleeperSnapshot = { fetchedAt: new Date().toISOString(), players: normalize(raw) };
    snapshot = fresh;
    return fresh;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Returns the cached daily snapshot, refreshing only when stale. A caller
 * pressing "Refresh" repeatedly still reads this same cache — it never
 * re-fetches Sleeper's full player payload on demand.
 */
export async function getSleeperSnapshot(options: { forceRefresh?: boolean } = {}): Promise<{
  snapshot: SleeperSnapshot;
  stale: boolean;
  error: string | null;
}> {
  const isStale = !snapshot || Date.now() - new Date(snapshot.fetchedAt).getTime() > SNAPSHOT_TTL_MS;

  if (!isStale && !options.forceRefresh) {
    return { snapshot: snapshot as SleeperSnapshot, stale: false, error: null };
  }

  try {
    if (!inFlightFetch) {
      inFlightFetch = fetchFreshSnapshot().finally(() => {
        inFlightFetch = null;
      });
    }
    const fresh = await inFlightFetch;
    return { snapshot: fresh, stale: false, error: null };
  } catch (err) {
    if (snapshot) {
      return { snapshot, stale: true, error: err instanceof Error ? err.message : "Sleeper fetch failed" };
    }
    throw err;
  }
}

export function __setSnapshotForTests(value: SleeperSnapshot | null): void {
  snapshot = value;
  inFlightFetch = null;
}
