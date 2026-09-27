import { describe, expect, it } from "vitest";
import {
  calculateCombinedEstimate,
  calculatePayoutCents,
  groupLegsByEvent,
  legPriceInputs,
  resolveLegPrice,
  snapshotLegPrice,
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
  const idea = (id: string, capture: number | null, book: string | null, line: number | null) =>
    ({ id, eventId: `evt-${id}`, oddsAtCaptureAmerican: capture, sportsbookAtCapture: book, lineAtCapture: line }) as CapturedIdea;

  it("builds each leg's resolver input from the idea and that leg's live context at the slip's book", () => {
    const live = {
      a: { currentOddsAmerican: -120, currentLine: 64.5, oddsFetchedAt: "2026-09-26T12:00:00.000Z", marketAvailable: true } as LiveContext,
    };
    const lookedUp: string[] = [];
    const inputs = legPriceInputs([idea("a", -110, "FanDuel", 63.5), idea("b", 150, null, null)], "DraftKings", (ideaId) => {
      lookedUp.push(ideaId);
      return live[ideaId as "a"];
    });

    expect(lookedUp).toEqual(["a", "b"]);
    expect(inputs).toStrictEqual([
      {
        ideaId: "a",
        eventId: "evt-a",
        currentOddsAmerican: -120,
        currentLine: 64.5,
        currentOddsFetchedAt: "2026-09-26T12:00:00.000Z",
        captureOddsAmerican: -110,
        captureLine: 63.5,
        captureSportsbook: "FanDuel",
        slipSportsbook: "DraftKings",
        marketAvailable: true,
      },
      {
        ideaId: "b",
        eventId: "evt-b",
        currentOddsAmerican: null,
        currentLine: null,
        currentOddsFetchedAt: null,
        captureOddsAmerican: 150,
        captureLine: null,
        captureSportsbook: null,
        slipSportsbook: "DraftKings",
        marketAvailable: null,
      },
    ]);
  });
});

describe("resolveLegPrice carries what a saved leg records (INV-12)", () => {
  const base = { ideaId: "a", eventId: "evt-a", slipSportsbook: "DraftKings" };

  it("a live price carries its line and fetch time", () => {
    expect(
      resolveLegPrice({
        ...base,
        currentOddsAmerican: -120,
        currentLine: 64.5,
        currentOddsFetchedAt: "2026-09-26T12:00:00.000Z",
        captureOddsAmerican: -110,
        captureLine: 63.5,
      }),
    ).toStrictEqual({
      ideaId: "a",
      eventId: "evt-a",
      oddsAmerican: -120,
      source: "current",
      line: 64.5,
      oddsFetchedAt: "2026-09-26T12:00:00.000Z",
    });
  });

  it("a capture price carries the capture line and book, never the live line", () => {
    expect(
      resolveLegPrice({
        ...base,
        currentOddsAmerican: null,
        currentLine: 64.5,
        captureOddsAmerican: -110,
        captureLine: 63.5,
        captureSportsbook: "FanDuel",
      }),
    ).toMatchObject({ source: "capture", oddsAmerican: -110, line: 63.5, captureBook: { label: "FanDuel", match: "different" } });
  });

  it("a market the book no longer offers has no price and no line", () => {
    expect(
      resolveLegPrice({ ...base, currentOddsAmerican: -120, currentLine: 64.5, captureOddsAmerican: -110, captureLine: 63.5, marketAvailable: false }),
    ).toMatchObject({ source: "unavailable", oddsAmerican: null, line: null, unavailableReason: "market_not_offered", lastKnownOddsAmerican: -120 });
  });
});

describe("snapshotLegPrice", () => {
  const base = { ideaId: "a", eventId: "evt-a", slipSportsbook: "DraftKings" };

  it("records a live price as the slip's book, with its line and age", () => {
    const resolved = resolveLegPrice({ ...base, currentOddsAmerican: -120, currentLine: 64.5, currentOddsFetchedAt: "t1", captureOddsAmerican: null });
    expect(snapshotLegPrice(resolved, "DraftKings")).toStrictEqual({
      source: "current",
      oddsAmerican: -120,
      line: 64.5,
      book: "DraftKings",
      oddsFetchedAt: "t1",
    });
  });

  it("records a capture price with the capture book and how it compares to the slip's", () => {
    const resolved = resolveLegPrice({ ...base, currentOddsAmerican: null, captureOddsAmerican: 150, captureLine: 1.5, captureSportsbook: "Fan Duel" });
    expect(snapshotLegPrice(resolved, "DraftKings")).toStrictEqual({
      source: "capture",
      oddsAmerican: 150,
      line: 1.5,
      book: "Fan Duel",
      bookMatch: "different",
    });
  });

  it("records an unpriced leg as unavailable, keeping why when the market isn't offered", () => {
    const none = resolveLegPrice({ ...base, currentOddsAmerican: null, captureOddsAmerican: null });
    expect(snapshotLegPrice(none, "DraftKings")).toStrictEqual({ source: "unavailable", oddsAmerican: null, line: null, book: null });
    const pulled = resolveLegPrice({ ...base, currentOddsAmerican: -120, captureOddsAmerican: -110, marketAvailable: false });
    expect(snapshotLegPrice(pulled, "DraftKings")).toStrictEqual({
      source: "unavailable",
      oddsAmerican: null,
      line: null,
      book: null,
      unavailableReason: "market_not_offered",
    });
  });
});
