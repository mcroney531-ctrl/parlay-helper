import type { CapturedIdea, LiveContext } from "@/domain/types";

export type ChangeRadarEntry = {
  kind: "line_change" | "odds_change" | "status_change" | "game_change" | "stale" | "not_found" | "ok";
  text: string;
};

const STALE_MINUTES = 60;

function minutesAgo(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
}

/**
 * Reads as "what changed", never "what to bet" — purely descriptive diffs
 * between the capture snapshot and the latest fetched context.
 */
export function buildChangeRadar(idea: CapturedIdea, liveContext: LiveContext | undefined): ChangeRadarEntry[] {
  const entries: ChangeRadarEntry[] = [];

  if (!liveContext) {
    entries.push({ kind: "not_found", text: "No current data fetched yet for this leg." });
    return entries;
  }

  if (liveContext.marketAvailable === false) {
    entries.push({
      kind: "not_found",
      text: `Market no longer offered by ${liveContext.sportsbook}.`,
    });
  }

  const lineChanged =
    idea.lineAtCapture !== null &&
    liveContext.currentLine !== null &&
    idea.lineAtCapture !== liveContext.currentLine;
  const oddsChanged =
    idea.oddsAtCaptureAmerican !== null &&
    liveContext.currentOddsAmerican !== null &&
    idea.oddsAtCaptureAmerican !== liveContext.currentOddsAmerican;

  if (lineChanged || oddsChanged) {
    const captureLine = idea.lineAtCapture ?? "?";
    const captureOdds = formatAmerican(idea.oddsAtCaptureAmerican);
    const currentLine = liveContext.currentLine ?? "?";
    const currentOdds = formatAmerican(liveContext.currentOddsAmerican);
    entries.push({
      kind: lineChanged ? "line_change" : "odds_change",
      text: `Captured: ${idea.selection ?? ""} ${captureLine} (${captureOdds}) · Now: ${idea.selection ?? ""} ${currentLine} (${currentOdds})`,
    });
  }

  if (liveContext.playerStatus && liveContext.playerStatus !== "Active") {
    entries.push({
      kind: "status_change",
      text: `Player status: ${liveContext.playerStatus}${liveContext.depthChartPosition ? ` · ${liveContext.depthChartPosition}` : ""}`,
    });
  }

  if (liveContext.gameStatus && liveContext.gameStatus !== "Scheduled") {
    entries.push({ kind: "game_change", text: `Game status: ${liveContext.gameStatus}` });
  }

  const age = minutesAgo(liveContext.fetchedAt);
  if (age > STALE_MINUTES) {
    entries.push({ kind: "stale", text: `Odds last checked ${age} min ago — may be stale.` });
  }

  for (const warning of liveContext.warnings) {
    entries.push({ kind: "stale", text: warning });
  }

  if (entries.length === 0) {
    entries.push({ kind: "ok", text: `No change since capture. Checked ${age} min ago.` });
  }

  return entries;
}

function formatAmerican(value: number | null): string {
  if (value === null) return "—";
  return value > 0 ? `+${value}` : `${value}`;
}
