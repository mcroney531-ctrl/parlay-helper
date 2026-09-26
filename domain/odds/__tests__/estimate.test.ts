import { describe, expect, it } from "vitest";
import {
  calculateCombinedEstimate,
  calculatePayoutCents,
  groupLegsByEvent,
  legPriceInputs,
  resolveLegPrice,
} from "../estimate";
import type { CapturedIdea, LiveContext } from "@/domain/types";

describe("resolveLegPrice", () => {
  it("prefers current price when available", () => {
    const resolved = resolveLegPrice({
      ideaId: "1",
      eventId: null,
      currentOddsAmerican: -120,
      captureOddsAmerican: -110,
    });
    expect(resolved).toMatchObject({ oddsAmerican: -120, source: "current" });
  });

  it("falls back to capture price and marks it explicitly", () => {
    const resolved = resolveLegPrice({
      ideaId: "1",
      eventId: null,
      currentOddsAmerican: null,
      captureOddsAmerican: -110,
    });
    expect(resolved).toMatchObject({ oddsAmerican: -110, source: "capture" });
  });

  it("reports unavailable rather than substituting a price", () => {
    const resolved = resolveLegPrice({
      ideaId: "1",
      eventId: null,
      currentOddsAmerican: null,
      captureOddsAmerican: null,
    });
    expect(resolved).toMatchObject({ oddsAmerican: null, source: "unavailable" });
  });
});

describe("calculateCombinedEstimate", () => {
  it("multiplies decimal odds across legs", () => {
    const result = calculateCombinedEstimate([
      { ideaId: "1", eventId: null, currentOddsAmerican: 100, captureOddsAmerican: null },
      { ideaId: "2", eventId: null, currentOddsAmerican: 100, captureOddsAmerican: null },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.decimalOdds).toBeCloseTo(4);
      expect(result.americanOdds).toBeCloseTo(300);
    }
  });

  it("fails explicitly when a leg has no usable price, never substituting", () => {
    const result = calculateCombinedEstimate([
      { ideaId: "1", eventId: null, currentOddsAmerican: 100, captureOddsAmerican: null },
      { ideaId: "2", eventId: null, currentOddsAmerican: null, captureOddsAmerican: null },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("missing_price");
      expect(result.unavailableLegIds).toEqual(["2"]);
    }
  });

  it("fails explicitly with no legs", () => {
    const result = calculateCombinedEstimate([]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("no_legs");
  });
});

describe("calculatePayoutCents", () => {
  it("multiplies stake by decimal odds", () => {
    expect(calculatePayoutCents(200, 4)).toBe(800);
  });
});

describe("groupLegsByEvent", () => {
  it("only returns events with 2+ shared legs", () => {
    const groups = groupLegsByEvent([
      { ideaId: "1", eventId: "evt-a" },
      { ideaId: "2", eventId: "evt-a" },
      { ideaId: "3", eventId: "evt-b" },
    ]);
    expect(groups.size).toBe(1);
    expect(groups.get("evt-a")).toEqual(["1", "2"]);
  });

  it("ignores legs with no event id", () => {
    const groups = groupLegsByEvent([
      { ideaId: "1", eventId: null },
      { ideaId: "2", eventId: null },
    ]);
    expect(groups.size).toBe(0);
  });
});

describe("legPriceInputs", () => {
  const idea = (id: string, capture: number | null, book: string | null) =>
    ({ id, eventId: `evt-${id}`, oddsAtCaptureAmerican: capture, sportsbookAtCapture: book }) as CapturedIdea;

  it("builds each leg's resolver input from the idea and that leg's live context at the slip's book", () => {
    const live = { a: { currentOddsAmerican: -120, marketAvailable: true } as LiveContext };
    const lookedUp: string[] = [];
    const inputs = legPriceInputs([idea("a", -110, "FanDuel"), idea("b", 150, null)], "DraftKings", (ideaId) => {
      lookedUp.push(ideaId);
      return live[ideaId as "a"];
    });

    expect(lookedUp).toEqual(["a", "b"]);
    expect(inputs).toEqual([
      { ideaId: "a", eventId: "evt-a", currentOddsAmerican: -120, captureOddsAmerican: -110, captureSportsbook: "FanDuel", slipSportsbook: "DraftKings", marketAvailable: true },
      { ideaId: "b", eventId: "evt-b", currentOddsAmerican: null, captureOddsAmerican: 150, captureSportsbook: null, slipSportsbook: "DraftKings", marketAvailable: null },
    ]);
  });
});
