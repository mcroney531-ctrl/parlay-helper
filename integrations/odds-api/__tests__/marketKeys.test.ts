import { describe, expect, it } from "vitest";
import { MARKET_OPTIONS } from "../marketKeys";

describe("MARKET_OPTIONS.requiresLine", () => {
  it("marks yes/no and moneyline-style markets as not requiring a line", () => {
    const noLine = ["player_anytime_td", "player_1st_td", "h2h"];
    for (const key of noLine) {
      expect(MARKET_OPTIONS.find((m) => m.key === key)?.requiresLine).toBe(false);
    }
  });

  it("marks over/under and spread-style markets as requiring a line", () => {
    const withLine = ["player_reception_yds", "player_pass_tds", "totals", "spreads"];
    for (const key of withLine) {
      expect(MARKET_OPTIONS.find((m) => m.key === key)?.requiresLine).toBe(true);
    }
  });

  it("gives every market a defined requiresLine value", () => {
    for (const option of MARKET_OPTIONS) {
      expect(typeof option.requiresLine).toBe("boolean");
    }
  });
});
