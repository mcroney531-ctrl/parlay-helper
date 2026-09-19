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

  // Odds age comes from oddsFetchedAt only. fetchedAt is "whichever provider
  // wrote last" and the player-status refresh overwrites it with the Sleeper
  // snapshot's own time, so it says nothing reliable about the price.
  const oddsAge = minutesAgo(liveContext.oddsFetchedAt);

  // A market the book no longer offers has no current line or price. Whatever is
  // still stored is last-known, so it is shown as such and never compared with
  // the capture values as if it were "Now".
  const marketGone = liveContext.marketAvailable === false;
  if (marketGone) {
    const lastSeen =
      liveContext.currentOddsAmerican !== null
        ? ` Last price seen: ${formatAmerican(liveContext.currentOddsAmerican)}${oddsAge !== null ? ` (${oddsAge} min ago)` : ""}.`
        : "";
    entries.push({
      kind: "not_found",
      text: `Market no longer offered by ${liveBook}.${lastSeen}`,
    });
  }

  const lineChanged =
    !marketGone &&
    idea.lineAtCapture !== null &&
    liveContext.currentLine !== null &&
    idea.lineAtCapture !== liveContext.currentLine;
  const oddsChanged =
    !marketGone &&
    idea.oddsAtCaptureAmerican !== null &&
    liveContext.currentOddsAmerican !== null &&
    idea.oddsAtCaptureAmerican !== liveContext.currentOddsAmerican;

  // The captured line and odds were observed at idea.sportsbookAtCapture; the
  // live values are for the slip's book. Only a same-book difference is a
  // "change since capture", and "different books" is only claimed when both
  // books are recognized. Otherwise (capture book unrecorded, or free text we
  // can't place) an ODDS difference is hedged, because prices vary by book,
  // while a LINE difference stays an ordinary change: the line is the user's
  // own proposition, not a price claim, so it is never muted.
  const captureBook = compareSportsbooks(idea.sportsbookAtCapture, liveContext.sportsbook);
  const captureBookText = idea.sportsbookAtCapture?.trim() ?? "";
  const selectionLabel = formatSelection(idea.selection);
  const value = (line: number | null, odds: number | null) => describeValue(selectionLabel, line, odds);

  if (lineChanged || oddsChanged) {
    if (captureBook === "same") {
      entries.push({
        kind: lineChanged ? "line_change" : "odds_change",
        text: `Captured: ${value(idea.lineAtCapture, idea.oddsAtCaptureAmerican)} · Now: ${value(liveContext.currentLine, liveContext.currentOddsAmerican)}`,
      });
    } else if (captureBook === "different") {
      entries.push({
        kind: "cross_book",
        text: `Captured at ${captureBookText}: ${value(idea.lineAtCapture, idea.oddsAtCaptureAmerican)} · Now at ${liveBook}: ${value(liveContext.currentLine, liveContext.currentOddsAmerican)} — different books, not a change since capture.`,
      });
    } else {
      const recorded = captureBook === "unverified";
      if (lineChanged) {
        const qualifier = recorded
          ? `captured at ${captureBookText}, this slip is ${liveBook}; not confirmed to be the same book`
          : "capture book not recorded";
        entries.push({
          kind: "line_change",
          text: `Captured: ${value(idea.lineAtCapture, null)} · Now: ${value(liveContext.currentLine, null)} (${qualifier})`,
        });
      }
      if (oddsChanged) {
        const captured = value(null, idea.oddsAtCaptureAmerican);
        const now = value(null, liveContext.currentOddsAmerican);
        entries.push({
          kind: "cross_book",
          text: recorded
            ? `Odds captured at ${captureBookText}: ${captured} · Now at ${liveBook}: ${now} — not confirmed to be the same book, so this may not be a change since capture.`
            : `Odds captured (book not recorded): ${captured} · Now at ${liveBook}: ${now} — the capture book is unknown, so this may not be a change.`,
        });
      }
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
    } else if (compared && captureBook === "unverified") {
      text = `Matches the capture values, but ${captureBookText} isn't confirmed to be ${liveBook}. Checked ${oddsAge} min ago.`;
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

/** "Over 250.5 (-110)", leaving out whichever of line / odds is absent instead of printing an empty "(—)". */
function describeValue(selection: string, line: number | null, odds: number | null): string {
  return `${selection}${line !== null ? ` ${line}` : ""}${odds !== null ? ` (${formatAmerican(odds)})` : ""}`.trim();
}

function formatSelection(selection: string | null): string {
  if (!selection) return "";
  return selection.charAt(0).toUpperCase() + selection.slice(1);
}
