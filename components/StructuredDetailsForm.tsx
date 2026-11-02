import type { CapturedIdea, Confidence } from "@/domain/types";

// Shared data-shape helpers between an idea and its editable form values.
// The actual editing UI lives in IdeaDetailsSheet.tsx.

export type StructuredFormValues = {
  sport: string;
  league: string;
  slateDate: string;
  playerName: string;
  playerId: string;
  team: string;
  opponent: string;
  eventId: string;
  marketKey: string;
  marketLabel: string;
  selection: string;
  lineAtCapture: string;
  oddsAtCaptureAmerican: string;
  sportsbookAtCapture: string;
  confidence: Confidence;
  note: string;
  /**
   * The user chose to use the stored capture odds as the price of the bet as
   * it will be saved ("Use -110 for this bet" in the details sheet). Not an
   * idea field: it tells the save to re-stamp which bet the odds belong to.
   */
  useCaptureForThisBet: boolean;
};

/** The save options a form asks for, alongside valuesToPatch. */
export function saveOptionsFor(values: StructuredFormValues): { restampCapture: boolean } {
  return { restampCapture: values.useCaptureForThisBet };
}

export function valuesFromIdea(idea: CapturedIdea): StructuredFormValues {
  return {
    sport: idea.sport ?? "",
    league: idea.league ?? "",
    slateDate: idea.slateDate ?? "",
    playerName: idea.playerName ?? "",
    playerId: idea.playerId ?? "",
    team: idea.team ?? "",
    opponent: idea.opponent ?? "",
    eventId: idea.eventId ?? "",
    marketKey: idea.marketKey ?? "",
    marketLabel: idea.marketLabel ?? "",
    selection: idea.selection ?? "",
    lineAtCapture: idea.lineAtCapture?.toString() ?? "",
    oddsAtCaptureAmerican: idea.oddsAtCaptureAmerican?.toString() ?? "",
    sportsbookAtCapture: idea.sportsbookAtCapture ?? "",
    confidence: idea.confidence,
    note: idea.note,
    useCaptureForThisBet: false,
  };
}

/** A number, or null for blank or non-numeric text: never NaN or Infinity, which would compare unequal to itself. */
function finiteOrNull(text: string): number | null {
  if (!text.trim()) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

export function valuesToPatch(values: StructuredFormValues): Partial<CapturedIdea> {
  return {
    sport: values.sport.trim() || null,
    league: values.league.trim() || null,
    slateDate: values.slateDate.trim() || null,
    playerName: values.playerName.trim() || null,
    playerId: values.playerId.trim() || null,
    team: values.team.trim() || null,
    opponent: values.opponent.trim() || null,
    eventId: values.eventId.trim() || null,
    marketKey: values.marketKey.trim() || null,
    marketLabel: values.marketLabel.trim() || null,
    selection: values.selection.trim() || null,
    lineAtCapture: finiteOrNull(values.lineAtCapture),
    oddsAtCaptureAmerican: finiteOrNull(values.oddsAtCaptureAmerican),
    sportsbookAtCapture: values.sportsbookAtCapture.trim() || null,
    confidence: values.confidence,
    note: values.note,
  };
}

/** True when an idea has the minimum fields needed to make sense as a slip leg. */
export function isEssentiallyComplete(values: StructuredFormValues): boolean {
  return Boolean(values.marketKey.trim() && values.selection.trim());
}
