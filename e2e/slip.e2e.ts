import { expect, test, type Page } from "@playwright/test";
import { idea, seedV2 } from "./support/seed";
import { EARLIER, markPlaced, slipTab } from "./support/flows";
import { clearIdeaPriceElsewhere, deleteIdeaElsewhere } from "./support/storage";

// Chunk 3d: the Slip screen's deleted legs, unpriced consent (INV-17), the
// confirm closing when Mark Placed is blocked, and starting a new slip.

const markPlacedButton = (page: Page) => page.getByRole("button", { name: "Mark Placed", exact: true });
const confirmGroup = (page: Page) => page.getByRole("group", { name: "Confirm Mark Placed" });
/** The Mark Placed error. Next.js keeps an empty route announcer, also role=alert, on every page. */
const placeError = (page: Page) => page.getByRole("alert").filter({ hasText: /\S/ });
const legList = (page: Page) => page.getByRole("list").filter({ has: page.getByRole("button", { name: /from this slip$/ }) });

test("a leg whose idea was deleted keeps its row in place with Remove, and blocks Mark Placed until it's removed", async ({ page }) => {
  await seedV2(page, {
    ideas: [idea("i1", "Puka Nacua"), idea("i2", "Kyren Williams")],
    slips: [{ id: "s1", name: "Sunday Core", sportsbook: "FanDuel", ideaIds: ["i1", "gone", "i2"], updatedAt: EARLIER }],
  });
  await page.goto("/slip");

  const rows = legList(page).locator(":scope > li");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText("Puka Nacua");
  await expect(rows.nth(1)).toContainText("Original idea deleted");
  await expect(rows.nth(2)).toContainText("Kyren Williams");
  await expect(markPlacedButton(page)).toBeDisabled();
  await expect(page.getByText("Remove the deleted leg before marking it placed.")).toBeVisible();

  await rows.nth(1).getByRole("button", { name: "Remove deleted leg from this slip" }).click();
  await expect(rows).toHaveCount(2);
  await expect(page.getByText("Original idea deleted")).toHaveCount(0);
  await expect(markPlacedButton(page)).toBeEnabled();

  await markPlaced(page);
  await expect(page.getByText("FanDuel · 2 legs")).toBeVisible();
});

test("legs that lose their price while the confirm is open aren't placed; the confirm comes back asking about them", async ({ page }) => {
  await seedV2(page, {
    ideas: [idea("i1", "Puka Nacua"), idea("i2", "Kyren Williams")],
    slips: [{ id: "s1", name: "Sunday Core", sportsbook: "FanDuel", ideaIds: ["i1", "i2"], updatedAt: EARLIER }],
  });
  await page.goto("/slip");

  // Both legs priced: the confirm asks nothing about prices.
  await markPlacedButton(page).click();
  await expect(confirmGroup(page)).toContainText("Mark “Sunday Core” as placed?");
  await expect(confirmGroup(page)).not.toContainText("no current price");

  // Another tab removes both prices before Yes.
  await clearIdeaPriceElsewhere(page, "i1");
  await clearIdeaPriceElsewhere(page, "i2");
  await confirmGroup(page).getByRole("button", { name: "Yes, mark placed" }).click();

  await expect(placeError(page)).toHaveText("2 legs have no current price, and you weren't warned about them. Review the slip and confirm again.");
  await expect(page).toHaveURL(/\/slip$/);
  await expect(confirmGroup(page)).toHaveCount(0);

  // Asked again, now about the prices that are gone; consenting places it.
  await markPlacedButton(page).click();
  await expect(confirmGroup(page)).toContainText("No current prices are available for this slip. Mark it placed anyway?");
  await confirmGroup(page).getByRole("button", { name: "Yes, mark placed" }).click();
  await expect(page).toHaveURL(/\/history$/);
  await expect(page.getByText("FanDuel · 2 legs")).toBeVisible();
});

test("when Mark Placed becomes blocked, the open confirm closes, and doesn't come back when the block clears", async ({ page }) => {
  await seedV2(page, {
    ideas: [idea("i1", "Puka Nacua"), idea("i2", "Kyren Williams")],
    slips: [{ id: "s1", name: "Sunday Core", sportsbook: "FanDuel", ideaIds: ["i1", "i2"], updatedAt: EARLIER }],
  });
  await page.goto("/slip");
  await markPlacedButton(page).click();
  await expect(confirmGroup(page)).toBeVisible();

  // Another tab deletes a leg's idea; Yes finds it and the slip reloads with the deleted leg.
  await deleteIdeaElsewhere(page, "i2");
  await confirmGroup(page).getByRole("button", { name: "Yes, mark placed" }).click();
  await expect(placeError(page)).toHaveText("Cannot place: 1 leg references an idea that no longer exists. Remove it from the slip first.");
  await expect(confirmGroup(page)).toHaveCount(0);
  await expect(markPlacedButton(page)).toBeDisabled();
  await expect(page.getByText("Remove the deleted leg before marking it placed.")).toBeVisible();

  await page.getByRole("button", { name: "Remove deleted leg from this slip" }).click();
  await expect(markPlacedButton(page)).toBeEnabled();
  await expect(confirmGroup(page)).toHaveCount(0);

  // A fresh tap gives a fresh confirm for the slip as it is now.
  await markPlaced(page);
  await expect(page.getByText("FanDuel · 1 leg")).toBeVisible();
});

test("Start a new slip makes the new slip current, even with another draft and nothing current", async ({ page }) => {
  await seedV2(page, {
    ideas: [idea("i1", "Puka Nacua")],
    slips: [{ id: "s1", name: "Sunday Core", sportsbook: "FanDuel", ideaIds: ["i1"], updatedAt: EARLIER }],
  });
  await page.goto("/slip");
  await page.evaluate(() => window.localStorage.setItem("parlay-helper:active-candidate-id", "none"));
  await page.reload();
  await expect(page.getByRole("button", { name: /^Sunday Core · FanDuel/ })).toBeVisible(); // Continue a draft

  const form = page.getByRole("form", { name: "Start a new slip" });
  await form.getByLabel("Name").fill("Late Slate");
  await form.getByLabel("Sportsbook").fill("DraftKings");
  await form.getByRole("button", { name: "Create slip" }).click();

  await expect(slipTab(page, "Late Slate")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("No legs yet")).toBeVisible();

  // Current across a reload, and the other draft is untouched.
  await page.reload();
  await expect(slipTab(page, "Late Slate")).toHaveAttribute("aria-selected", "true");
  await expect(slipTab(page, "Sunday Core")).toHaveAttribute("aria-selected", "false");
});

test("picking a game never guesses the player's team, and fills the opponent only when the team names a side", async ({ page }) => {
  await page.route("**/api/events?league=NFL", (route) =>
    route.fulfill({
      json: {
        status: "ok",
        events: [{ eventId: "ev1", commenceTime: "2026-09-20T17:00:00.000Z", homeTeam: "Los Angeles Rams", awayTeam: "Seattle Seahawks" }],
      },
    }),
  );
  await seedV2(page, { ideas: [idea("i1", "", { rawText: "puka overs", playerName: null, marketKey: null, selection: null })], slips: [] });
  await page.goto("/ideas");
  await page.getByRole("button", { name: "Complete details" }).click();
  const sheet = page.getByRole("dialog", { name: "Complete details" });
  await sheet.getByText("More details (game, odds, confidence, note)").click();

  const team = sheet.getByLabel("Team", { exact: true });
  const opponent = sheet.getByLabel("Opponent", { exact: true });
  const game = sheet.getByRole("combobox", { name: "Game" });
  const pickGame = async () => {
    await game.fill("Rams");
    await sheet.getByRole("option", { name: /Seattle Seahawks @ Los Angeles Rams/ }).click();
    await expect(game).toHaveValue(/Seattle Seahawks @ Los Angeles Rams/);
  };

  // No team yet: the game says nothing about the player's side, so both stay blank.
  await pickGame();
  await expect(team).toHaveValue("");
  await expect(opponent).toHaveValue("");

  // Team names the home side: the opponent is the away side.
  await sheet.getByRole("button", { name: "Clear game" }).click();
  await team.fill("Los Angeles Rams");
  await pickGame();
  await expect(opponent).toHaveValue("Seattle Seahawks");

  // An opponent the user typed is kept.
  await sheet.getByRole("button", { name: "Clear game" }).click();
  await opponent.fill("Somebody Else");
  await pickGame();
  await expect(opponent).toHaveValue("Somebody Else");

  // Saved as shown.
  await opponent.fill("Seattle Seahawks");
  await sheet.getByRole("button", { name: "Save details" }).click();
  await expect(sheet).toBeHidden();
  await page.getByRole("button", { name: "Complete details" }).click();
  await page.getByText("More details (game, odds, confidence, note)").click();
  await expect(page.getByLabel("Team", { exact: true })).toHaveValue("Los Angeles Rams");
  await expect(page.getByLabel("Opponent", { exact: true })).toHaveValue("Seattle Seahawks");
});

test("the old screen names redirect permanently to the new ones, with the query kept", async ({ page }) => {
  for (const [from, to] of [
    ["/capture?from=shortcut", "/ideas?from=shortcut"],
    ["/bucket", "/ideas"],
    ["/builder?tab=s1", "/slip?tab=s1"],
  ]) {
    const response = await page.goto(from);
    expect(response?.request().redirectedFrom()?.url()).toMatch(new RegExp(`${from.replace("?", "\\?")}$`));
    expect(await response?.request().redirectedFrom()?.response().then((r) => r?.status())).toBe(308);
    await expect(page).toHaveURL(new RegExp(`${to.replace("?", "\\?")}$`));
  }
});
