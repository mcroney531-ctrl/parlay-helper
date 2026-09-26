import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { CandidateParlay, CapturedIdea, LiveContext } from "@/domain/types";

const data = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock("@/app/DataProvider", () => ({ useData: () => data.value }));
vi.mock("next/navigation", () => ({ usePathname: () => "/builder", useRouter: () => ({ push: () => {} }) }));

import { BuilderTray } from "../BuilderTray";
import { CurrentSlipTray } from "../CurrentSlipTray";
import { PropLegCard } from "../PropLegCard";
import BuilderPage from "@/app/builder/page";

/** Visible text only, with entities decoded, so assertions read like what the user sees. */
function text(html: string): string {
  return html
    .replace(/<!-- -->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function makeIdea(overrides: Partial<CapturedIdea> = {}): CapturedIdea {
  return {
    id: "idea-1",
    rawText: "Puka o63.5",
    detailsStatus: "structured",
    sport: null,
    league: "NFL",
    slateDate: null,
    playerId: null,
    playerName: "Puka Nacua",
    team: null,
    opponent: null,
    eventId: "evt-1",
    marketKey: "player_reception_yds",
    marketLabel: "Receiving Yards",
    selection: "Over",
    lineAtCapture: 63.5,
    oddsAtCaptureAmerican: null,
    sportsbookAtCapture: null,
    confidence: "unrated",
    note: "",
    createdAt: "2026-09-20T12:00:00.000Z",
    updatedAt: "2026-09-20T12:00:00.000Z",
    archivedAt: null,
    ...overrides,
  };
}

function makeLive(overrides: Partial<LiveContext> = {}): LiveContext {
  return {
    ideaId: "idea-1",
    sportsbook: "fanduel",
    eventId: "evt-1",
    currentLine: 63.5,
    currentOddsAmerican: -110,
    marketAvailable: true,
    playerStatus: null,
    depthChartPosition: null,
    gameStatus: null,
    scheduledStart: null,
    fetchedAt: new Date().toISOString(),
    source: "odds-api",
    warnings: [],
    oddsFetchedAt: new Date().toISOString(),
    oddsSource: "odds-api",
    playerStatusFetchedAt: null,
    playerStatusSource: null,
    ...overrides,
  };
}

function makeSlip(ideaIds: string[], sportsbook = "FanDuel"): CandidateParlay {
  return {
    id: "slip-1",
    name: "Sunday",
    sportsbook,
    ideaIds,
    stakeCents: 1000,
    promoType: "none",
    createdAt: "2026-09-20T12:00:00.000Z",
    updatedAt: "2026-09-20T12:00:00.000Z",
  } as unknown as CandidateParlay;
}

beforeEach(() => {
  data.value = {};
});

describe("PropLegCard: why a leg has no live price", () => {
  it("a raw leg names the details it's missing instead of 'No current data fetched yet'", () => {
    const out = text(
      renderToStaticMarkup(
        <PropLegCard
          idea={makeIdea({ eventId: null, marketKey: null, league: null, marketLabel: null, selection: null })}
          liveContext={undefined}
          slipSportsbook="FanDuel"
          onRemove={() => {}}
        />,
      ),
    );
    expect(out).toContain("No live price until this idea has a game, a market and a league set in its details.");
    expect(out).not.toMatch(/fetched yet/);
  });

  it("a leg on an unsupported book says so before any refresh, with the supported list", () => {
    const out = text(renderToStaticMarkup(<PropLegCard idea={makeIdea()} liveContext={undefined} slipSportsbook="Bet365" onRemove={() => {}} />));
    expect(out).toContain('Live odds aren\'t available for "Bet365" (supported: FanDuel, DraftKings, BetMGM, Caesars, ESPN BET).');
  });

  it("a refreshable leg on a supported book is unchanged", () => {
    const out = text(renderToStaticMarkup(<PropLegCard idea={makeIdea()} liveContext={undefined} slipSportsbook="DK" onRemove={() => {}} />));
    expect(out).toContain("No current data fetched yet for this leg.");
    expect(out).not.toMatch(/No live price|aren't available/);
  });
});

describe("BuilderTray", () => {
  const tray = (legCount: number, unpriced: number, odds: number | null = null, payout: number | null = null) =>
    text(
      renderToStaticMarkup(
        <BuilderTray
          legCount={legCount}
          estimatedOddsAmerican={odds}
          estimatedPayoutCents={payout}
          unpricedLegCount={unpriced}
          expanded={false}
          onToggle={() => {}}
        />,
      ),
    );

  it("says how many legs have no price instead of a bare dash", () => {
    expect(tray(5, 2)).toBe("5 legs 2 of 5 legs have no price");
    expect(tray(3, 1)).toBe("3 legs 1 of 3 legs has no price");
    expect(tray(1, 1)).toBe("1 leg 1 of 1 leg has no price");
  });

  it("shows odds and payout when every leg is priced", () => {
    expect(tray(2, 0, 264, 3640)).toBe("2 legs +264 $36.40");
  });
});

describe("CurrentSlipTray (Ideas side) stays identity-only", () => {
  it("shows the slip name and leg count, with no price count, odds or payout, even when legs are unpriced", () => {
    const slip = makeSlip(["priced", "raw"]);
    data.value = {
      loading: false,
      candidates: [slip],
      activeCandidate: slip,
      ideas: [makeIdea({ id: "priced" }), makeIdea({ id: "raw", eventId: null })],
      liveContextByKey: { "priced::fanduel": makeLive({ ideaId: "priced", currentOddsAmerican: 150 }) },
    };
    const out = text(renderToStaticMarkup(<CurrentSlipTray />));
    expect(out).toBe("Sunday · 2 legs View slip");
  });
});

describe("builder page refresh messages", () => {
  it("renders the skipped-legs notice as a polite, muted status, separate from the red error alert", () => {
    const slip = makeSlip(["idea-1"]);
    data.value = {
      loading: false,
      candidates: [slip],
      ideas: [makeIdea()],
      liveContextByKey: {},
      activeCandidateId: slip.id,
      activeCandidate: slip,
      setActiveCandidateId: () => {},
      refreshCandidates: async () => {},
      refreshLiveContext: async () => {},
      refreshIdeas: async () => {},
      refreshFinalized: async () => {},
      finalized: [],
      storageError: null,
    };
    const html = renderToStaticMarkup(<BuilderPage />);

    const status = html.match(/<p[^>]*role="status"[^>]*>/g) ?? [];
    expect(status).toHaveLength(1);
    expect(status[0]).toContain("var(--color-muted)");
    expect(status[0]).not.toContain("--color-danger");
    // Nothing has failed, so there is no alert at all.
    expect(html).not.toContain('role="alert"');
  });
});
