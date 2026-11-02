import { describe, expect, it } from "vitest";
import type { CapturedIdea } from "@/domain/types";
import { resolveSlipLegs } from "@/domain/candidates/slipLegs";
import { detectSlipSignals, kickoffWindowFor } from "../slipSignals";

function idea(id: string, eventId: string | null, team: string | null): CapturedIdea {
  return {
    id,
    rawText: id,
    detailsStatus: "structured",
    sport: null,
    league: "NFL",
    slateDate: null,
    playerId: null,
    playerName: id,
    team,
    opponent: null,
    eventId,
    marketKey: "player_reception_yds",
    marketLabel: null,
    selection: "Over",
    lineAtCapture: null,
    oddsAtCaptureAmerican: null,
    sportsbookAtCapture: null,
    confidence: "unrated",
    note: "",
    createdAt: "2026-10-31T00:00:00.000Z",
    updatedAt: "2026-10-31T00:00:00.000Z",
    archivedAt: null,
  };
}

function legsOf(ids: string[], ideas: CapturedIdea[]) {
  const byId = new Map(ideas.map((i) => [i.id, i]));
  return resolveSlipLegs(ids, (id) => byId.get(id));
}

const noStart = () => null;

describe("detectSlipSignals", () => {
  it("a slip with no deleted legs gives the same signals as before, and no incomplete count", () => {
    const ideas = [idea("a", "e1", "LAR"), idea("b", "e1", "LAR"), idea("c", "e1", "LAR"), idea("d", "e2", "KC")];
    const signals = detectSlipSignals(legsOf(["a", "b", "c", "d"], ideas), noStart);
    expect(signals.deletedLegCount).toBe(0);
    expect(signals.sameGame).toBe(true);
    expect(signals.correlation.map((s) => s.ideaIds)).toEqual([["a", "b", "c"]]);
    expect(signals.concentration.find((s) => s.dimension === "event")?.explanation).toBe(
      "3 of 4 legs (75%) share the same event.",
    );
  });

  it("deleted legs are left out of every signal and counted instead", () => {
    const ideas = [idea("a", "e1", "LAR"), idea("b", "e1", "LAR")];
    const signals = detectSlipSignals(legsOf(["a", "gone-1", "b", "gone-2"], ideas), noStart);
    expect(signals.deletedLegCount).toBe(2);
    expect(signals.correlation.map((s) => s.ideaIds)).toEqual([["a", "b"]]);
  });

  it("the concentration check counts present legs only: deleted legs don't reach the 4-leg minimum", () => {
    // 3 present legs on one event + 1 deleted leg: 4 stored legs, but only 3 known ones.
    const ideas = [idea("a", "e1", "LAR"), idea("b", "e1", "LAR"), idea("c", "e1", "LAR")];
    const signals = detectSlipSignals(legsOf(["a", "b", "c", "gone"], ideas), noStart);
    expect(signals.concentration).toEqual([]);
    expect(signals.deletedLegCount).toBe(1);
  });

  it("the concentration share is over present legs only, so a deleted leg doesn't dilute it", () => {
    // 4 present legs, 2 on one event (50%), plus 2 deleted legs. Over all 6 stored legs it would be 33%.
    const ideas = [idea("a", "e1", null), idea("b", "e1", null), idea("c", "e2", null), idea("d", "e3", null)];
    const signals = detectSlipSignals(legsOf(["a", "gone-1", "b", "c", "gone-2", "d"], ideas), noStart);
    const event = signals.concentration.find((s) => s.dimension === "event");
    expect(event?.explanation).toBe("2 of 4 legs (50%) share the same event.");
    expect(signals.deletedLegCount).toBe(2);
  });

  it("a slip of deleted legs only has no signals, but says how many legs are unknown", () => {
    const signals = detectSlipSignals(legsOf(["gone-1", "gone-2"], []), noStart);
    expect(signals).toEqual({ sameGame: false, correlation: [], concentration: [], deletedLegCount: 2 });
  });

  it("kickoff windows come from the start time and nothing is made up for an unknown one", () => {
    expect(kickoffWindowFor("2026-11-01T17:05:00.000Z")).toBe("2026-11-01T17");
    expect(kickoffWindowFor(null)).toBeNull();
    expect(kickoffWindowFor("not a date")).toBeNull();
  });
});
