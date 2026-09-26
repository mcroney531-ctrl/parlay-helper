"use client";

import { useState } from "react";
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
 * Resolution order: validated image → initials → silhouette. Fixed size
 * and lazy loading, so nothing shifts if an image arrives late, and a
 * 404/broken image (retired player, no photo on file, offline) falls back
 * to initials/silhouette immediately rather than showing a broken icon.
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
  // Reset the failure flag during render (not an effect) whenever the URL
  // itself changes — React's recommended pattern for "adjusting state when
  // a prop changes" without an extra render-then-effect round trip.
  const [imageFailed, setImageFailed] = useState(false);
  const [lastImageUrl, setLastImageUrl] = useState(imageUrl);
  if (imageUrl !== lastImageUrl) {
    setLastImageUrl(imageUrl);
    setImageFailed(false);
  }

  const dimension = size === "compact" ? "var(--avatar-size-compact)" : "var(--avatar-size)";
  const initials = initialsFor(name);
  const colors = teamColorsFor(team ?? null);
  const showImage = Boolean(imageUrl) && !imageFailed;

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
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote, unpredictable-domain avatar; not an app asset for next/image to optimize.
        <img
          src={imageUrl as string}
          alt=""
          width={44}
          height={44}
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setImageFailed(true)}
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
