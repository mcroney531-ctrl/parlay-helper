import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { captureStructuredIdea, updateIdeaDetails } from "../ideaService";
import { captureIsEligible, propositionOf } from "../captureProposition";
import { legPriceInputs, resolveLegPrice } from "@/domain/odds/estimate";
import { describeLegPrice } from "@/domain/odds/priceSource";
import { captureNoteFor } from "@/components/IdeaDetailsSheet";
import { valuesFromIdea } from "@/components/StructuredDetailsForm";
import { __setDBForTests } from "@/storage/indexeddb/db";
import { getIdea, putIdea } from "@/storage/indexeddb/repositories/ideasRepository";
import type { CapturedIdea } from "@/domain/types";

// Chunk 4a (Trevor/GPT 2026-11-02): a capture price is a price source only for
// the bet it was entered for. A market change (or any change of the bet) keeps
// the stored capture as history but stops it being used; filling in a blank
// isn't a change; entering the odds again makes them this bet's.

beforeEach(() => {
  (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  __setDBForTests(null);
});

const recYdsOver635 = {
  league: "NFL",
  eventId: null,
  marketKey: "player_reception_yds",
  marketLabel: "Receiving Yards",
  playerName: "Puka Nacua",
  selection: "Over",
  lineAtCapture: 63.5,
  oddsAtCaptureAmerican: -110,
  sportsbookAtCapture: "FanDuel",
};

/** How the Slip screen prices this idea alone, with no live price: the capture price or nothing. */
function priceOf(idea: CapturedIdea) {
  const [input] = legPriceInputs([idea], "FanDuel", () => undefined);
  return resolveLegPrice(input);
}

describe("which bet a capture price belongs to", () => {
  it("is recorded when the price is captured, and the price is used", async () => {
    const idea = await captureStructuredIdea("Puka O63.5", recYdsOver635);
    expect(idea.captureProposition).toEqual(propositionOf(idea));
    expect(priceOf(idea)).toMatchObject({ source: "capture", oddsAmerican: -110 });
  });

  it("a market change keeps the capture stored but stops it being a price", async () => {
    const idea = await captureStructuredIdea("Puka O63.5", recYdsOver635);
    // As the sheet saves it: Anytime TD, the line cleared, the odds untouched.
    const edited = await updateIdeaDetails(idea.id, { marketKey: "player_anytime_td", selection: "Yes", lineAtCapture: null, oddsAtCaptureAmerican: -110, sportsbookAtCapture: "FanDuel" });

    expect(edited.oddsAtCaptureAmerican).toBe(-110); // kept, as history
    expect(edited.captureProposition).toMatchObject({ marketKey: "player_reception_yds", lineAtCapture: 63.5 });
    expect(captureIsEligible(edited)).toBe(false);
    const resolved = priceOf(edited);
    expect(resolved).toMatchObject({ source: "unavailable", unavailableReason: "capture_for_other_bet", oddsAmerican: null });
    expect(describeLegPrice(resolved, "FanDuel").text).toBe("No price · the captured price was for a different bet");
  });

  it("so does a change of line, selection or player", async () => {
    for (const change of [{ lineAtCapture: 70.5 }, { selection: "Under" }, { playerName: "Kyren Williams" }]) {
      const idea = await captureStructuredIdea("Puka O63.5", recYdsOver635);
      expect(captureIsEligible(await updateIdeaDetails(idea.id, change))).toBe(false);
    }
  });

  it("filling in a blank (a game picked later) or a case-only edit isn't a different bet", async () => {
    const idea = await captureStructuredIdea("Puka O63.5", recYdsOver635);
    const withGame = await updateIdeaDetails(idea.id, { eventId: "evt-9" });
    expect(captureIsEligible(withGame)).toBe(true);
    expect(captureIsEligible(await updateIdeaDetails(idea.id, { playerName: " puka nacua ", selection: "over" }))).toBe(true);
  });

  it("a game that was part of the bet when the price was captured is part of it after", async () => {
    const idea = await captureStructuredIdea("Puka O63.5", { ...recYdsOver635, eventId: "evt-9" });
    expect(captureIsEligible(await updateIdeaDetails(idea.id, { eventId: "evt-10" }))).toBe(false);
  });

  it("entering or changing the capture odds makes them the price of the bet as it now is", async () => {
    const idea = await captureStructuredIdea("Puka O63.5", recYdsOver635);
    await updateIdeaDetails(idea.id, { marketKey: "player_receptions", lineAtCapture: 5.5 });
    const reentered = await updateIdeaDetails(idea.id, { oddsAtCaptureAmerican: 120 });
    expect(reentered.captureProposition).toMatchObject({ marketKey: "player_receptions", lineAtCapture: 5.5 });
    expect(priceOf(reentered)).toMatchObject({ source: "capture", oddsAmerican: 120 });
  });

  it("clearing the capture odds clears the record of its bet", async () => {
    const idea = await captureStructuredIdea("Puka O63.5", recYdsOver635);
    expect((await updateIdeaDetails(idea.id, { oddsAtCaptureAmerican: null })).captureProposition).toBeNull();
  });

  it("an idea saved before the field existed: its price is the bet's as it stands, until the bet changes", async () => {
    const idea = await captureStructuredIdea("Puka O63.5", recYdsOver635);
    const legacy = { ...idea };
    delete legacy.captureProposition;
    await putIdea(legacy);
    expect(captureIsEligible((await getIdea(idea.id))!)).toBe(true);

    const edited = await updateIdeaDetails(idea.id, { marketKey: "player_anytime_td", lineAtCapture: null });
    expect(edited.captureProposition).toMatchObject({ marketKey: "player_reception_yds", lineAtCapture: 63.5 });
    expect(captureIsEligible(edited)).toBe(false);
  });
});

describe("the details sheet's note under Odds at capture", () => {
  it("appears once the bet in the form is no longer the captured one, and goes when odds are entered for it", async () => {
    const idea = await captureStructuredIdea("Puka O63.5", recYdsOver635);
    const values = valuesFromIdea(idea);
    expect(captureNoteFor(idea, values)).toBeNull();

    const anytimeTd = { ...values, marketKey: "player_anytime_td", selection: "yes", lineAtCapture: "" };
    expect(captureNoteFor(idea, anytimeTd)).toBe(
      "Captured -110 was for Receiving Yards Over 63.5, so it isn't used as a price for this bet. Enter odds for this bet to use them.",
    );
    expect(captureNoteFor(idea, { ...anytimeTd, oddsAtCaptureAmerican: "140" })).toBeNull();
  });
});
