import { describe, expect, it } from "vitest";
import { resolveLegPrice, type LegPriceInput } from "../estimate";
import { describeLegPrice } from "../priceSource";

function input(overrides: Partial<LegPriceInput>): LegPriceInput {
  return {
    ideaId: "a",
    eventId: "evt-1",
    currentOddsAmerican: null,
    captureOddsAmerican: null,
    slipSportsbook: "DraftKings",
    ...overrides,
  };
}

const describe_ = (overrides: Partial<LegPriceInput>) => describeLegPrice(resolveLegPrice(input(overrides)), "DraftKings");

describe("describeLegPrice: which price the estimate uses for a leg", () => {
  it("a live price is named as live at the slip's book", () => {
    expect(describe_({ currentOddsAmerican: -120 })).toEqual({ text: "Price -120 · live at DraftKings", tone: "neutral" });
  });

  it("a capture price at the slip's book says there's no live price", () => {
    expect(describe_({ captureOddsAmerican: 150, captureSportsbook: "draft kings" })).toEqual({
      text: "Price +150 · captured at draft kings (no live price)",
      tone: "neutral",
    });
  });

  it("a capture price from another book is flagged, never shown as the slip book's price", () => {
    expect(describe_({ captureOddsAmerican: 150, captureSportsbook: "FanDuel" })).toEqual({
      text: "Price +150 · captured at FanDuel, a different book from DraftKings (no live price)",
      tone: "caution",
    });
  });

  it("a capture price from an unrecognized or unrecorded book is flagged too", () => {
    expect(describe_({ captureOddsAmerican: 150, captureSportsbook: "My Local Book" }).tone).toBe("caution");
    expect(describe_({ captureOddsAmerican: 150, captureSportsbook: "My Local Book" }).text).toContain("not confirmed to be DraftKings");
    expect(describe_({ captureOddsAmerican: 150, captureSportsbook: null })).toEqual({
      text: "Price +150 · captured, book not recorded (no live price)",
      tone: "caution",
    });
  });

  it("when a live price disappears, the leg shows it fell back to its capture price", () => {
    // The live row is gone (e.g. invalidated by an edit), so the resolver uses the capture price.
    expect(describe_({ currentOddsAmerican: null, captureOddsAmerican: -105, captureSportsbook: "FanDuel" }).text).toBe(
      "Price -105 · captured at FanDuel, a different book from DraftKings (no live price)",
    );
  });

  it("a market the book stopped offering has no price, whatever was stored", () => {
    expect(describe_({ marketAvailable: false, currentOddsAmerican: -130, captureOddsAmerican: 150 })).toEqual({
      text: "No price · DraftKings isn't offering this market",
      tone: "missing",
    });
  });

  it("a leg with no live and no capture price says so", () => {
    expect(describe_({})).toEqual({ text: "No price · no live or capture price", tone: "missing" });
  });
});
