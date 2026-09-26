import type { Confidence } from "@/domain/types";

const LABEL: Record<Confidence, string> = {
  core: "Core",
  like: "Like",
  longshot: "Longshot",
  unrated: "Unrated",
};

const TONE: Record<Confidence, { bg: string; fg: string }> = {
  core: { bg: "var(--confidence-core-bg)", fg: "var(--confidence-core-fg)" },
  like: { bg: "var(--confidence-like-bg)", fg: "var(--confidence-like-fg)" },
  longshot: { bg: "var(--confidence-longshot-bg)", fg: "var(--confidence-longshot-fg)" },
  unrated: { bg: "var(--confidence-unrated-bg)", fg: "var(--confidence-unrated-fg)" },
};

/**
 * Confidence is user-authored — this must never read as model scoring.
 * A plain colored pill with a text label, nothing scored or computed.
 */
export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  const { bg, fg } = TONE[confidence];
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ background: bg, color: fg }}
    >
      {LABEL[confidence]}
    </span>
  );
}
