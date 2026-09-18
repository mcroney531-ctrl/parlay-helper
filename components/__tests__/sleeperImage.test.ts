import { describe, expect, it } from "vitest";
import { sleeperHeadshotUrl } from "../sleeperImage";

describe("sleeperHeadshotUrl", () => {
  it("builds the CDN URL from a player id", () => {
    expect(sleeperHeadshotUrl("4046")).toBe("https://sleepercdn.com/content/nfl/players/4046.jpg");
  });

  it("returns null for a null id", () => {
    expect(sleeperHeadshotUrl(null)).toBeNull();
  });

  it("returns null for an undefined id (legacy finalized snapshots predating this field)", () => {
    expect(sleeperHeadshotUrl(undefined)).toBeNull();
  });

  it("returns null for an empty string id", () => {
    expect(sleeperHeadshotUrl("")).toBeNull();
  });
});
