// Sleeper serves a per-player headshot JPEG straight from this CDN path,
// keyed by the same player_id returned by the players endpoint — no auth,
// no extra round trip. It isn't listed in Sleeper's formal API reference
// (docs.sleeper.com only documents the JSON endpoints), but it's a stable,
// widely-relied-upon convention across third-party Sleeper integrations.
// A missing/retired player simply 404s, which PlayerAvatar treats the same
// as any other broken image: fall back to initials/silhouette.
export function sleeperHeadshotUrl(playerId: string | null | undefined): string | null {
  if (!playerId) return null;
  return `https://sleepercdn.com/content/nfl/players/${playerId}.jpg`;
}
