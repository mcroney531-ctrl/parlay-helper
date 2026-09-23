import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SportsbookSupportHint } from "../SportsbookSupportHint";

function text(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();
}

describe("SportsbookSupportHint", () => {
  it.each([
    ["Bet365", true],
    ["BetRivers", true],
    ["FanDuel", false],
    ["DK", false],
    ["fd", false],
    ["DraftKings Sportsbook", false],
    ["", false],
    ["   ", false],
  ] as const)("%j -> hint shown: %s", (book, shown) => {
    const html = renderToStaticMarkup(<SportsbookSupportHint sportsbook={book} />);
    if (!shown) {
      expect(html).toBe("");
      return;
    }
    expect(text(html)).toContain(`Live odds aren't available for "${book}"`);
    expect(text(html)).toContain("You can still build this slip");
  });
});
