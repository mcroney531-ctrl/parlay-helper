import { describe, expect, it } from "vitest";
import { isEssentiallyComplete, valuesToPatch, type StructuredFormValues } from "../StructuredDetailsForm";

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

describe("valuesToPatch numeric fields", () => {
  it("keeps real numbers and turns blank input into null", () => {
    expect(valuesToPatch(makeValues({ lineAtCapture: "63.5", oddsAtCaptureAmerican: "-110" }))).toMatchObject({
      lineAtCapture: 63.5,
      oddsAtCaptureAmerican: -110,
    });
    expect(valuesToPatch(makeValues({ lineAtCapture: " ", oddsAtCaptureAmerican: "" }))).toMatchObject({
      lineAtCapture: null,
      oddsAtCaptureAmerican: null,
    });
  });

  it.each(["abc", "Infinity", "-Infinity", "1e999", "NaN"])("turns non-finite input %j into null, never NaN or Infinity", (raw) => {
    const patch = valuesToPatch(makeValues({ lineAtCapture: raw, oddsAtCaptureAmerican: raw }));
    expect(patch.lineAtCapture).toBeNull();
    expect(patch.oddsAtCaptureAmerican).toBeNull();
  });
});
