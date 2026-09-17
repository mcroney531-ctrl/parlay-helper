import { UserSilhouetteIcon } from "@/components/icons";
import { teamColorsFor } from "@/components/teamColors";

function initialsFor(name: string | null): string | null {
  if (!name) return null;
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  const initials = `${first}${last}`.toUpperCase();
  return initials || null;
}

/**
 * Fixed circular identity slot used everywhere a player appears.
 * Resolution order: validated Sleeper image → initials → silhouette.
 * Parlay Helper's Sleeper integration does not currently surface a
 * documented, terms-cleared headshot URL (see README), so `imageUrl` is
 * accepted for forward-compatibility but is expected to be null today —
 * the initials/silhouette fallback is what actually renders. Fixed size
 * and no async layout change, so nothing shifts if an image ever arrives.
 */
export function PlayerAvatar({
  name,
  team,
  imageUrl,
  size = "default",
  teamRing = false,
}: {
  name: string | null;
  team?: string | null;
  imageUrl?: string | null;
  size?: "default" | "compact";
  teamRing?: boolean;
}) {
  const dimension = size === "compact" ? "var(--avatar-size-compact)" : "var(--avatar-size)";
  const initials = initialsFor(name);
  const colors = teamColorsFor(team ?? null);

  const inner = (
    <span
      className="flex items-center justify-center overflow-hidden rounded-full text-xs font-semibold"
      style={{
        width: dimension,
        height: dimension,
        background: initials ? "var(--color-selected-bg)" : "var(--color-border)",
        color: initials ? "var(--color-brand)" : "var(--color-muted)",
      }}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote, unpredictable-domain avatar; not an app asset for next/image to optimize.
        <img
          src={imageUrl}
          alt=""
          width={44}
          height={44}
          loading="lazy"
          className="h-full w-full object-cover"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      ) : initials ? (
        <span aria-hidden="true">{initials}</span>
      ) : (
        <UserSilhouetteIcon aria-hidden="true" style={{ width: "62%", height: "62%" }} />
      )}
    </span>
  );

  if (!teamRing) return inner;

  return (
    <span
      className="team-avatar-ring inline-flex shrink-0 rounded-full"
      style={
        {
          "--team-primary": colors.primary,
          "--team-accent": colors.accent,
        } as React.CSSProperties
      }
    >
      {inner}
    </span>
  );
}
