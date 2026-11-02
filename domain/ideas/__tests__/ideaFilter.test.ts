import { describe, expect, it } from "vitest";
import type { CapturedIdea } from "@/domain/types";
import { filterIdeas, type IdeaFilter } from "../ideaFilter";
import type { IdeaUsage } from "../ideaUsage";
import { usageBadges } from "@/components/IdeaCard";
import { missingDetailsText } from "@/domain/odds/refreshability";

function idea(id: string, o: Partial<CapturedIdea> = {}): CapturedIdea {
  return {
    id, rawText: id, sport: "NFL", league: "NFL", eventId: "evt", marketKey: "player_reception_yds", marketLabel: null,
    playerName: null, playerId: null, team: null, opponent: null, selection: null, lineAtCapture: 63.5,
    oddsAtCaptureAmerican: null, sportsbookAtCapture: null, confidence: null, note: "", slateDate: null,
    detailsStatus: "structured", createdAt: "2026-10-31T00:00:00.000Z", updatedAt: "2026-10-31T00:00:00.000Z", archivedAt: null, ...o,
  } as unknown as CapturedIdea;
}

const NONE: IdeaFilter = { search: "", confidence: "all", completion: "all", showArchived: false, hidePlaced: false };
const usage = (placed: string[], drafts: Record<string, string[]> = {}): IdeaUsage => ({
  placed: new Set(placed),
  draftSlips: new Map(Object.entries(drafts).map(([k, v]) => [k, new Set(v)])),
});
const ids = (list: CapturedIdea[]) => list.map((i) => i.id);

describe("Hide placed", () => {
  const ideas = [idea("placed"), idea("draft"), idea("both"), idea("free")];
  const u = usage(["placed", "both"], { draft: ["s1"], both: ["s2"] });

  it("is off by default, and hides exactly the ideas the Placed badge marks", () => {
    expect(ids(filterIdeas(ideas, NONE, u))).toEqual(["placed", "draft", "both", "free"]);
    expect(ids(filterIdeas(ideas, { ...NONE, hidePlaced: true }, u))).toEqual(["draft", "free"]);
    for (const i of ideas) {
      expect(usageBadges(u, i.id).includes("Placed")).toBe(!filterIdeas([i], { ...NONE, hidePlaced: true }, u).length);
    }
  });

  it("combines with the other filters and doesn't touch archived views otherwise", () => {
    const list = [...ideas, idea("old", { archivedAt: "2026-10-01T00:00:00.000Z" })];
    expect(ids(filterIdeas(list, { ...NONE, showArchived: true }, u))).toEqual(["old"]);
    expect(ids(filterIdeas(list, { ...NONE, hidePlaced: true, search: "dra" }, u))).toEqual(["draft"]);
  });
});

describe("usage badges", () => {
  it("names Placed and the number of draft slips, never adding the two together", () => {
    const u = usage(["a"], { a: ["s1"], b: ["s1", "s2"] });
    expect(usageBadges(u, "a")).toEqual(["Placed", "In 1 slip"]);
    expect(usageBadges(u, "b")).toEqual(["In 2 slips"]);
    expect(usageBadges(u, "c")).toEqual([]);
  });
});

describe("missing details text", () => {
  it("names exactly what an idea lacks for live odds, and nothing when complete", () => {
    expect(missingDetailsText(idea("x"))).toBeNull();
    expect(missingDetailsText(idea("x", { eventId: null }))).toBe("Needs a game to refresh odds");
    // A market with lines needs the line: it is part of the bet (exact-line rule).
    expect(missingDetailsText(idea("x", { lineAtCapture: null }))).toBe("Needs a line to refresh odds");
    expect(missingDetailsText(idea("x", { eventId: null, marketKey: null, league: null }))).toBe(
      "Needs a game, a market and a league to refresh odds",
    );
  });
});
