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

test("Team and Opponent are recomputed on a player or game change, over typed values; a market or line change never moves them", async ({ page }) => {
  // Chunk 4b. Sleeper gives a player's team as a code; the sheet stores the full name, as the game's sides are named.
  await page.route("**/api/sleeper?search=*", (route) =>
    route.fulfill({
      json: {
        results: [
          { playerId: "p1", fullName: "Puka Nacua", team: "LAR", position: "WR" },
          { playerId: "p2", fullName: "DK Metcalf", team: "PIT", position: "WR" },
        ],
      },
    }),
  );
  // Saved with the game Seahawks @ Rams, but an opponent left over from another game.
  await seedV2(page, {
    ideas: [idea("i1", "", { rawText: "puka overs", playerName: null, eventId: "ev1", team: "Los Angeles Rams", opponent: "San Francisco 49ers" })],
    slips: [],
  });
  await page.goto("/ideas");
  await page.getByRole("button", { name: /Complete details|Edit details/ }).click();
  const sheet = page.getByRole("dialog", { name: /Complete details|Edit details/ });
  await sheet.getByText("More details (team, odds, confidence, note)").click();
  const team = sheet.getByLabel("Team", { exact: true });
  const opponent = sheet.getByLabel("Opponent", { exact: true });
  const player = sheet.getByRole("combobox", { name: "Player" });
  await expect(sheet.getByRole("combobox", { name: "Game" })).toHaveValue(/Seattle Seahawks @ Los Angeles Rams/);
  const pickPlayer = async (search: string, name: string) => {
    await player.fill(search);
    await sheet.getByRole("option", { name: new RegExp(name) }).click();
  };

  // A market or line change recomputes nothing, even where a recompute would differ.
  await sheet.getByLabel("Market").selectOption({ label: "Receptions" });
  await sheet.getByLabel("Line at capture").fill("5.5");
  await expect(team).toHaveValue("Los Angeles Rams");
  await expect(opponent).toHaveValue("San Francisco 49ers");

  // Picking a player sets Team from the player's team, and Opponent from the game.
  await pickPlayer("Puka", "Puka Nacua");
  await expect(team).toHaveValue("Los Angeles Rams");
  await expect(opponent).toHaveValue("Seattle Seahawks");

  // A player whose team isn't in this game: their Team, and no Opponent guessed.
  await sheet.getByText("Change", { exact: true }).click();
  await pickPlayer("Metcalf", "DK Metcalf");
  await expect(team).toHaveValue("Pittsburgh Steelers");
  await expect(opponent).toHaveValue("");

  // Typed values survive market and line changes...
  await team.fill("Kansas City Chiefs");
  await opponent.fill("Somebody Else");
  await sheet.getByLabel("Market").selectOption({ label: "Receiving Yards" });
  await sheet.getByLabel("Line at capture").fill("6.5");
  await expect(team).toHaveValue("Kansas City Chiefs");
  await expect(opponent).toHaveValue("Somebody Else");

  // ...but a player change recomputes both from the new player.
  await sheet.getByText("Change", { exact: true }).click();
  await pickPlayer("Puka", "Puka Nacua");
  await expect(team).toHaveValue("Los Angeles Rams");
  await expect(opponent).toHaveValue("Seattle Seahawks");

  // Typed values survive a save.
  await team.fill("Kansas City Chiefs");
  await opponent.fill("Somebody Else");
  await sheet.getByRole("button", { name: /^Save/ }).click();
  await expect(sheet).toBeHidden();
  await page.getByRole("button", { name: /Complete details|Edit details/ }).click();
  await sheet.getByText("More details (team, odds, confidence, note)").click();
  await expect(team).toHaveValue("Kansas City Chiefs");
  await expect(opponent).toHaveValue("Somebody Else");

  // A game change recomputes the typed Opponent (Kansas City isn't in this game); Team is kept.
  await sheet.getByRole("button", { name: "Clear game" }).click();
  await sheet.getByRole("combobox", { name: "Game" }).fill("Rams");
  await sheet.getByRole("option", { name: /Seattle Seahawks @ Los Angeles Rams/ }).click();
  await expect(team).toHaveValue("Kansas City Chiefs");
  await expect(opponent).toHaveValue("");
});

test("a player picked before the game list loads recomputes Opponent when the game's sides arrive; opening the sheet recomputes nothing", async ({ page }) => {
  // B's review of 1c3c2e0, C1: the events request is held back.
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/events?league=NFL", async (route) => {
    await held;
    await route.fulfill({
      json: { status: "ok", events: [{ eventId: "ev1", commenceTime: "2026-09-20T17:00:00.000Z", homeTeam: "Los Angeles Rams", awayTeam: "Seattle Seahawks" }] },
    });
  });
  await page.route("**/api/sleeper?search=*", (route) =>
    route.fulfill({ json: { results: [{ playerId: "p1", fullName: "Puka Nacua", team: "LAR", position: "WR" }] } }),
  );
  // Saved with game Seahawks @ Rams and an opponent left over from another game.
  await seedV2(page, {
    ideas: [idea("i1", "", { rawText: "puka overs", playerName: null, eventId: "ev1", team: "Los Angeles Rams", opponent: "San Francisco 49ers" })],
    slips: [],
  });
  await page.goto("/ideas");
  await page.getByRole("button", { name: /Complete details|Edit details/ }).click();
  const sheet = page.getByRole("dialog", { name: /Complete details|Edit details/ });
  await sheet.getByText("More details (team, odds, confidence, note)").click();
  const team = sheet.getByLabel("Team", { exact: true });
  const opponent = sheet.getByLabel("Opponent", { exact: true });
  await expect(sheet.getByText("Loading games…")).toBeVisible();

  // Picked while the sides aren't known: Team now, Opponent left as it is (pending), not blanked.
  await sheet.getByRole("combobox", { name: "Player" }).fill("Puka");
  await sheet.getByRole("option", { name: /Puka Nacua/ }).click();
  await expect(team).toHaveValue("Los Angeles Rams");
  await expect(opponent).toHaveValue("San Francisco 49ers");

  // The sides arrive: the pending recompute runs.
  release();
  await expect(sheet.getByRole("combobox", { name: "Game" })).toHaveValue(/Seattle Seahawks @ Los Angeles Rams/);
  await expect(opponent).toHaveValue("Seattle Seahawks");

  // Opening the sheet again recomputes nothing when the game list arrives.
  await sheet.getByLabel("Opponent", { exact: true }).fill("San Francisco 49ers");
  await sheet.getByRole("button", { name: /^Save/ }).click();
  await expect(sheet).toBeHidden();
  await page.reload();
  await page.getByRole("button", { name: /Complete details|Edit details/ }).click();
  await sheet.getByText("More details (team, odds, confidence, note)").click();
  await expect(sheet.getByRole("combobox", { name: "Game" })).toHaveValue(/Seattle Seahawks @ Los Angeles Rams/);
  await expect(opponent).toHaveValue("San Francisco 49ers");
});

test("editing the text of a player's name (a typo fix) recomputes neither Team nor Opponent", async ({ page }) => {
  // Trevor's call on 1c3c2e0: only picking a player from the list, or clearing it, recomputes.
  await seedV2(page, {
    ideas: [idea("i1", "Puka Nacuaa", { eventId: "ev1", team: "Los Angeles Rams", opponent: "Seattle Seahawks" })],
    slips: [],
  });
  await page.goto("/ideas");
  await card(page, "Puka Nacuaa").getByRole("button", { name: /Complete details|Edit details/ }).click();
  const sheet = page.getByRole("dialog", { name: /Complete details|Edit details/ });
  await sheet.getByText("More details (team, odds, confidence, note)").click();
  await expect(sheet.getByRole("combobox", { name: "Game" })).toHaveValue(/Seattle Seahawks @ Los Angeles Rams/);
  await sheet.getByRole("combobox", { name: "Player" }).fill("Puka Nacua");
  await expect(sheet.getByLabel("Team", { exact: true })).toHaveValue("Los Angeles Rams");
  await expect(sheet.getByLabel("Opponent", { exact: true })).toHaveValue("Seattle Seahawks");
});
