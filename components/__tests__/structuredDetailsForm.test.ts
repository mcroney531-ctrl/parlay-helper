import { describe, expect, it } from "vitest";
import { isEssentiallyComplete, type StructuredFormValues } from "../StructuredDetailsForm";

function makeValues(overrides: Partial<StructuredFormValues> = {}): StructuredFormValues {
  return {
    sport: "",
    league: "",
    slateDate: "",
    playerName: "",
    playerId: "",
    team: "",
    opponent: "",
    eventId: "",
    marketKey: "",
    marketLabel: "",
    selection: "",
    lineAtCapture: "",
    oddsAtCaptureAmerican: "",
    sportsbookAtCapture: "",
    confidence: "unrated",
    note: "",
    ...overrides,
  };
}

describe("isEssentiallyComplete", () => {
  it("is false for a bare raw-text idea with no market/selection", () => {
    expect(isEssentiallyComplete(makeValues())).toBe(false);
  });

  it("is false when only one of market/selection is set", () => {
    expect(isEssentiallyComplete(makeValues({ marketKey: "player_anytime_td" }))).toBe(false);
    expect(isEssentiallyComplete(makeValues({ selection: "yes" }))).toBe(false);
  });

  it("is true once both market and selection are set, even without a line", () => {
    expect(isEssentiallyComplete(makeValues({ marketKey: "player_anytime_td", selection: "yes" }))).toBe(true);
  });
});
