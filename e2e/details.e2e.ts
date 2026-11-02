import { expect, test, type Page } from "@playwright/test";
import { idea, seedV2 } from "./support/seed";
import { EARLIER } from "./support/flows";

// Chunk 4a: the details sheet. Game (which a live price needs) is no longer
// tucked into "More details"; switching to a market with no line clears the
// old line; a capture price entered for the old bet is kept but not used, and
// both the sheet and the Slip say so.

const card = (page: Page, text: string) => page.getByRole("listitem").filter({ hasText: text });

test.beforeEach(async ({ page }) => {
  await page.route("**/api/events?league=NFL", (route) =>
    route.fulfill({
      json: { status: "ok", events: [{ eventId: "ev1", commenceTime: "2026-09-20T17:00:00.000Z", homeTeam: "Los Angeles Rams", awayTeam: "Seattle Seahawks" }] },
    }),
  );
});

test("Game is in the main form, not behind More details", async ({ page }) => {
  await seedV2(page, { ideas: [idea("i1", "", { rawText: "puka overs", playerName: null, marketKey: null, selection: null })], slips: [] });
  await page.goto("/ideas");
  await page.getByRole("button", { name: "Complete details" }).click();
  const sheet = page.getByRole("dialog", { name: "Complete details" });

  const moreDetails = sheet.locator("details");
  await expect(moreDetails).not.toHaveAttribute("open", "");
  await expect(sheet.getByRole("combobox", { name: "Game" })).toBeVisible();
  await expect(moreDetails.getByRole("combobox", { name: "Game" })).toHaveCount(0);
  await expect(sheet.getByText("More details (team, odds, confidence, note)")).toBeVisible();
});

test("switching to a market with no line clears the line, and the old capture price stops counting", async ({ page }) => {
  // Puka Over 63.5 receiving yards, captured at -110.
  await seedV2(page, {
    ideas: [idea("i1", "Puka Nacua")],
    slips: [{ id: "s1", name: "Sunday Core", sportsbook: "FanDuel", ideaIds: ["i1"], updatedAt: EARLIER }],
  });
  await page.goto("/slip");
  await expect(page.getByText("Price -110 · captured, book not recorded (no live price)")).toBeVisible();

  await page.goto("/ideas");
  await card(page, "Puka Nacua").getByRole("button", { name: "Edit details" }).click();
  const sheet = page.getByRole("dialog", { name: "Edit details" });
  await expect(sheet.getByLabel("Line at capture")).toHaveValue("63.5");

  await sheet.getByLabel("Market").selectOption({ label: "Anytime TD Scorer" });
  await expect(sheet.getByLabel("Line at capture")).toHaveCount(0);
  await sheet.getByLabel("Selection").selectOption("yes");
  await sheet.getByText("More details (team, odds, confidence, note)").click();
  await expect(sheet.getByLabel("Odds at capture (American)")).toHaveValue("-110"); // kept, as history
  await expect(sheet.getByRole("status").filter({ hasText: "Captured -110 was for Receiving Yards Over 63.5" })).toBeVisible();
  await sheet.getByRole("button", { name: /^Save/ }).click();
  await expect(sheet).toBeHidden();

  // The line is gone from the idea; the capture price is no longer its price.
  // (Its raw text, as typed, still reads "over 63.5"; the structured summary has no line.)
  await expect(card(page, "Puka Nacua")).toContainText("Puka Nacua · Anytime TD Scorer · yes");
  await expect(card(page, "Puka Nacua")).not.toContainText("· 63.5");
  await page.goto("/slip");
  await expect(page.getByText("No price · the captured price was for a different bet")).toBeVisible();

  // Re-saving doesn't change that; choosing "Use -110 for this bet" does.
  await page.goto("/ideas");
  await card(page, "Puka Nacua").getByRole("button", { name: "Edit details" }).click();
  await sheet.getByText("More details (team, odds, confidence, note)").click();
  await sheet.getByRole("button", { name: "Use -110 for this bet" }).click();
  await expect(sheet.getByText(/^Captured .* was for/)).toHaveCount(0);
  await expect(sheet.getByText("-110 will be used as this bet’s captured price when you save.")).toBeVisible();
  await sheet.getByRole("button", { name: /^Save/ }).click();
  await page.goto("/slip");
  await expect(page.getByText("Price -110 · captured, book not recorded (no live price)")).toBeVisible();

  // Odds entered for a bet are its price too.
  await page.goto("/ideas");
  await card(page, "Puka Nacua").getByRole("button", { name: "Edit details" }).click();
  await sheet.getByLabel("Market").selectOption({ label: "First TD Scorer" });
  await sheet.getByText("More details (team, odds, confidence, note)").click();
  await expect(sheet.getByRole("button", { name: "Use -110 for this bet" })).toBeVisible();
  await sheet.getByLabel("Odds at capture (American)").fill("140");
  await expect(sheet.getByText(/^Captured .* was for/)).toHaveCount(0);
  await sheet.getByRole("button", { name: /^Save/ }).click();
  await page.goto("/slip");
  await expect(page.getByText("Price +140 · captured, book not recorded (no live price)")).toBeVisible();
});
