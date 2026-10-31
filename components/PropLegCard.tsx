"use client";

import type { CapturedIdea, LiveContext } from "@/domain/types";
import { buildChangeRadar, type ChangeRadarEntry } from "@/domain/odds/changeRadar";
import type { ResolvedLegPrice } from "@/domain/odds/estimate";
import { describeLegPrice, type LegPriceTone } from "@/domain/odds/priceSource";
import { describePriceBlockers, priceBlockers } from "@/domain/odds/refreshability";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { sleeperHeadshotUrl } from "@/components/sleeperImage";
import { Pill } from "@/components/StatusChip";
import { AlertCircleIcon } from "@/components/icons";
import { teamColorsFor } from "@/components/teamColors";
import { Button } from "@/components/FormControls";

// Keyed by the entry kind so a new kind without a tone is a compile error, not a silent grey line.
const RADAR_TONE: Record<ChangeRadarEntry["kind"], string> = {
  ok: "var(--color-muted)",
  line_change: "var(--color-info)",
  odds_change: "var(--color-info)",
  cross_book: "var(--color-info)",
  status_change: "var(--color-caution-fg)",
  game_change: "var(--color-caution-fg)",
  stale: "var(--color-caution-fg)",
  not_found: "var(--color-missing-fg)",
};

const PRICE_TONE: Record<LegPriceTone, string> = {
  neutral: "var(--color-muted)",
  caution: "var(--color-caution-fg)",
  missing: "var(--color-missing-fg)",
};

export function PropLegCard({
  idea,
  liveContext,
  slipSportsbook,
  resolvedPrice,
  onRemove,
}: {
  idea: CapturedIdea;
  liveContext: LiveContext | undefined;
  slipSportsbook: string;
  /** This leg's price as the slip's estimate resolved it (INV-12), so the card names the source the estimate uses. */
  resolvedPrice: ResolvedLegPrice | undefined;
  onRemove: () => void;
}) {
  const price = resolvedPrice ? describeLegPrice(resolvedPrice, slipSportsbook) : null;
  const blockers = priceBlockers(idea, slipSportsbook);
  const blockedText = describePriceBlockers(blockers, slipSportsbook);
  const radar = buildChangeRadar(idea, liveContext, blockers.length > 0);
  const marketLine = [idea.marketLabel, idea.selection].filter((v) => v !== null && v !== undefined && v !== "").join(" · ");
  const colors = teamColorsFor(idea.team);

  return (
    <li
      className="flex overflow-hidden rounded-[var(--radius-card)] border"
      style={{ borderColor: "var(--color-border)" }}
    >
      <span
        aria-hidden="true"
        className="team-rail w-1.5 shrink-0"
        style={
          {
            "--team-primary": colors.primary,
            "--team-accent": colors.accent,
          } as React.CSSProperties
        }
      />
      <div className="flex w-full items-start gap-3 p-3" style={{ background: "var(--color-surface)" }}>
        <PlayerAvatar name={idea.playerName} team={idea.team} imageUrl={sleeperHeadshotUrl(idea.playerId)} teamRing />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-base font-semibold" style={{ color: "var(--color-ink)" }}>
              {idea.playerName ?? idea.rawText}
              {idea.team ? <span style={{ color: "var(--color-muted)" }}> · {idea.team}</span> : null}
            </p>
            <Button variant="text" onClick={onRemove} aria-label={`Remove ${idea.playerName ?? idea.rawText} from this slip`}>
              Remove
            </Button>
          </div>
          {marketLine ? (
            <p className="text-sm" style={{ color: "var(--color-ink)" }}>
              {marketLine}
            </p>
          ) : (
            <Pill tone="caution">Needs details</Pill>
          )}

          <ul className="mt-1 flex flex-col gap-0.5">
            {price && (
              <li className="text-sm font-medium" style={{ color: PRICE_TONE[price.tone] }}>
                {price.text}
              </li>
            )}
            {blockedText && (
              <li className="flex items-start gap-1.5 text-sm font-medium" style={{ color: "var(--color-missing-fg)" }}>
                <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{blockedText}</span>
              </li>
            )}
            {radar.map((entry, i) => (
              <li
                key={i}
                className="flex items-start gap-1.5 text-sm font-medium"
                style={{ color: RADAR_TONE[entry.kind] }}
              >
                {entry.kind === "not_found" && <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />}
                <span>{entry.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </li>
  );
}
