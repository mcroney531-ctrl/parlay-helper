import type { CapturedIdea, LiveContext } from "@/domain/types";
import { compareSportsbooks } from "@/domain/sportsbook";

export type ChangeRadarEntry = {
  kind: "line_change" | "odds_change" | "cross_book" | "status_change" | "game_change" | "stale" | "not_found" | "ok";
  text: string;
};

const STALE_MINUTES = 60;

/** Null when the timestamp is missing or unparseable: an unknown age is never treated as 0 or as fresh. */
function minutesAgo(iso: string | null): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  return Number.isNaN(then) ? null : Math.max(0, Math.round((Date.now() - then) / 60000));
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

  const liveBook = liveContext.sportsbookLabel ?? liveContext.sportsbook;

  if (liveContext.marketAvailable === false) {
    entries.push({
      kind: "not_found",
      text: `Market no longer offered by ${liveBook}.`,
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

  // The captured line and odds were observed at idea.sportsbookAtCapture; the
  // live values are for the slip's book. Only a same-book difference is a
  // "change since capture". Across books, or when the capture book was never
  // recorded, the values are shown with their books and not called a change.
  const captureBook = compareSportsbooks(idea.sportsbookAtCapture, liveContext.sportsbook);
  const captureBookText = idea.sportsbookAtCapture?.trim() ?? "";

  if (lineChanged || oddsChanged) {
    const selectionLabel = formatSelection(idea.selection);
    const captureLine = idea.lineAtCapture !== null ? ` ${idea.lineAtCapture}` : "";
    const captureOdds = formatAmerican(idea.oddsAtCaptureAmerican);
    const currentLine = liveContext.currentLine !== null ? ` ${liveContext.currentLine}` : "";
    const currentOdds = formatAmerican(liveContext.currentOddsAmerican);
    const captured = `${selectionLabel}${captureLine} (${captureOdds})`;
    const now = `${selectionLabel}${currentLine} (${currentOdds})`;
    if (captureBook === "same") {
      entries.push({
        kind: lineChanged ? "line_change" : "odds_change",
        text: `Captured: ${captured} · Now: ${now}`,
      });
    } else if (captureBook === "different") {
      entries.push({
        kind: "cross_book",
        text: `Captured at ${captureBookText}: ${captured} · Now at ${liveBook}: ${now} — different books, not a change since capture.`,
      });
    } else {
      entries.push({
        kind: "cross_book",
        text: `Captured (book not recorded): ${captured} · Now at ${liveBook}: ${now} — the capture book is unknown, so this may not be a change.`,
      });
    }
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

  // Odds age comes from oddsFetchedAt only. fetchedAt is "whichever provider
  // wrote last" and the player-status refresh overwrites it with the Sleeper
  // snapshot's own time, so it says nothing reliable about the price.
  const oddsAge = minutesAgo(liveContext.oddsFetchedAt);
  if (oddsAge === null) {
    entries.push({ kind: "not_found", text: "No odds fetched yet for this leg." });
  } else if (oddsAge > STALE_MINUTES) {
    entries.push({ kind: "stale", text: `Odds last checked ${oddsAge} min ago — may be stale.` });
  }

  for (const warning of liveContext.warnings) {
    entries.push({ kind: "stale", text: warning });
  }

  if (entries.length === 0 && oddsAge !== null) {
    const compared =
      (idea.lineAtCapture !== null && liveContext.currentLine !== null) ||
      (idea.oddsAtCaptureAmerican !== null && liveContext.currentOddsAmerican !== null);
    let text = `No change since capture. Checked ${oddsAge} min ago.`;
    if (compared && captureBook === "different") {
      text = `Matches the capture values, but they were captured at ${captureBookText} and this is ${liveBook}. Checked ${oddsAge} min ago.`;
    } else if (compared && captureBook === "unknown") {
      text = `Matches the capture values, but the capture book was not recorded. Checked ${oddsAge} min ago.`;
    }
    entries.push({ kind: "ok", text });
  }

  return entries;
}

function formatAmerican(value: number | null): string {
  if (value === null) return "—";
  return value > 0 ? `+${value}` : `${value}`;
}

function formatSelection(selection: string | null): string {
  if (!selection) return "";
  return selection.charAt(0).toUpperCase() + selection.slice(1);
}
