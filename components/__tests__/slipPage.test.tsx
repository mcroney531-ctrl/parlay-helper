import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { CandidateParlay, CapturedIdea, LiveContext } from "@/domain/types";
import type { SlipEstimate } from "@/domain/odds/estimate";
import { liveContextKey } from "@/storage/indexeddb/repositories/liveContextRepository";
import { missingPriceMessage } from "../EstimatePanel";

// The real Slip page, rendered with its data mocked: the unit tests cover each
// piece, this pins that the page wires them together (a deleted leg keeps its
// row and its Remove; Mark Placed is blocked with its reason; each card's
// price line is the one the estimate uses).
const state: { value: Record<string, unknown> } = { value: {} };
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/slip",
}));
vi.mock("next/link", () => ({ default: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/app/DataProvider", () => ({ useData: () => state.value }));
import BuilderPage from "@/app/slip/page";

const T = "2026-10-31T12:00:00.000Z";

function idea(id: string, o: Partial<CapturedIdea> = {}): CapturedIdea {
  return {
    id, rawText: id, sport: "NFL", league: "NFL", eventId: "evt-1", marketKey: "player_reception_yds", marketLabel: "Rec yds",
    playerName: id, playerId: null, team: null, opponent: null, selection: "Over", lineAtCapture: 60.5,
    oddsAtCaptureAmerican: null, sportsbookAtCapture: null, confidence: null, note: "", slateDate: null,
    createdAt: T, updatedAt: T, archivedAt: null, ...o,
  } as unknown as CapturedIdea;
}

function live(ideaId: string, o: Partial<LiveContext> = {}): LiveContext {
  return {
    ideaId, sportsbook: "DraftKings", eventId: "evt-1", currentLine: 64.5, currentOddsAmerican: -120, marketAvailable: true,
    playerStatus: null, depthChartPosition: null, gameStatus: null, scheduledStart: null, fetchedAt: T, source: "odds-api",
    warnings: [], oddsFetchedAt: T, oddsSource: "odds-api", playerStatusFetchedAt: null, playerStatusSource: null, ...o,
  };
}

const text = (html: string) =>
  html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const noop = async () => {};

function renderSlip(ideaIds: string[], ideas: CapturedIdea[], lives: LiveContext[]): string {
  const slip = {
    id: "s1", name: "Sunday", sportsbook: "DraftKings", ideaIds, stakeCents: 500, promoLabel: "", promoMaxStakeCents: null,
    createdAt: T, updatedAt: T, status: "draft", revision: 3,
  } as unknown as CandidateParlay;
  const liveContextByKey: Record<string, LiveContext> = {};
  for (const l of lives) liveContextByKey[liveContextKey(l.ideaId, l.sportsbook)] = l;
  state.value = {
    candidates: [slip], ideas, liveContextByKey, loading: false, activeCandidateId: "s1", finalized: [],
    refreshCandidates: noop, refreshLiveContext: noop, refreshIdeas: noop, refreshFinalized: noop, setActiveCandidateId: () => {},
  };
  return renderToStaticMarkup(<BuilderPage />);
}

describe("Slip page", () => {
  it("keeps a deleted leg's row in place with Remove, and blocks Mark Placed with its reason", () => {
    const html = renderSlip(
      ["Alpha Receiver", "gone", "Bravo Receiver"],
      [idea("Alpha Receiver"), idea("Bravo Receiver")],
      [live("Alpha Receiver"), live("Bravo Receiver")],
    );
    const out = text(html);

    const alpha = out.indexOf("Alpha Receiver");
    const deleted = out.indexOf("Original idea deleted");
    const bravo = out.indexOf("Bravo Receiver");
    expect(alpha).toBeGreaterThanOrEqual(0);
    expect(deleted).toBeGreaterThan(alpha);
    expect(bravo).toBeGreaterThan(deleted);
    expect(out.slice(deleted, bravo)).toContain("Remove");

    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Mark Placed<\/button>/);
    expect(out).toContain("Remove the deleted leg before marking it placed.");
    expect(out).toContain("1 deleted leg to remove");
    expect(out).toContain("Context incomplete: 1 leg was deleted");
  });

  it("shows each leg's price source as the estimate resolves it, and says why there's no estimate", () => {
    const html = renderSlip(
      ["Live", "Pulled", "OtherBook", "Nothing"],
      [
        idea("Live"),
        idea("Pulled", { oddsAtCaptureAmerican: -110, sportsbookAtCapture: "FanDuel" }),
        idea("OtherBook", { oddsAtCaptureAmerican: 105, sportsbookAtCapture: "FanDuel" }),
        idea("Nothing"),
      ],
      [
        live("Live", { currentOddsAmerican: 130 }),
        live("Pulled", { marketAvailable: false, currentOddsAmerican: 150 }),
        live("OtherBook", { currentOddsAmerican: null, marketAvailable: null }),
      ],
    );
    const out = text(html);

    expect(out).toContain("Price +130 · live at DraftKings");
    expect(out).toContain("No price · DraftKings isn't offering this market");
    expect(out).toContain("Price +105 · captured at FanDuel, a different book from DraftKings (no live price)");
    expect(out).toContain("No price · no live or capture price");
    expect(out).toContain("2 of 4 legs have no price");
    expect(out).toContain(
      "Estimate cannot be calculated — 2 legs have no price at DraftKings. For 1 of them, DraftKings isn't offering the market, so no captured price is used.",
    );
    // The pulled leg has a capture price; nothing on screen may say it doesn't.
    expect(out).not.toContain("no capture or current price");
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Mark Placed<\/button>/);
  });
});

describe("missingPriceMessage", () => {
  const unavailable = (ids: string[], notOffered: string[]): SlipEstimate =>
    ({
      ok: false,
      reason: "missing_price",
      unavailableLegIds: ids,
      missingLegIds: [],
      legSources: ids.map((id) => ({
        ideaId: id,
        source: "unavailable",
        ...(notOffered.includes(id) ? { unavailableReason: "market_not_offered" } : {}),
      })),
    }) as unknown as SlipEstimate;

  it("names the slip's book and counts legs in the singular and plural", () => {
    expect(missingPriceMessage(unavailable(["a"], []), "FanDuel")).toBe(
      "Estimate cannot be calculated — 1 leg has no price at FanDuel.",
    );
    expect(missingPriceMessage(unavailable(["a", "b"], []), " ")).toBe(
      "Estimate cannot be calculated — 2 legs have no price at this slip's book.",
    );
  });

  it("says a not-offered market's captured price isn't used, without claiming there is none", () => {
    expect(missingPriceMessage(unavailable(["a"], ["a"]), "FanDuel")).toBe(
      "Estimate cannot be calculated — 1 leg has no price at FanDuel. FanDuel isn't offering its market, so no captured price is used.",
    );
    expect(missingPriceMessage(unavailable(["a", "b"], ["a", "b"]), "FanDuel")).toBe(
      "Estimate cannot be calculated — 2 legs have no price at FanDuel. FanDuel isn't offering their markets, so no captured price is used.",
    );
  });
});
