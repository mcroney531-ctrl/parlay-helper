import { expect, test, type Page } from "@playwright/test";
import { idea, seedV2 } from "./support/seed";
import { EARLIER, LATER, markPlaced, slipTab } from "./support/flows";

// The merged Ideas screen (chunk 3c): adding is never gated on details, the
// first add with no slip starts one inline, add mode replaces the old
// add-ideas sheet, and Hide placed reads the same usage as the Placed badge.

const card = (page: Page, text: string) => page.getByRole("listitem").filter({ hasText: text });

test("an idea without details can be added; with no slip, Add starts one inline and remembers the book", async ({ page }) => {
  await seedV2(page, {
    ideas: [
      idea("i1", "", { rawText: "puka overs", playerName: null, marketKey: null, selection: null }),
      idea("i2", "Kyren Williams"),
    ],
    slips: [],
  });
  await page.goto("/ideas");
  await expect(page.getByLabel("Save the thought before it disappears.")).toBeFocused();

  const raw = card(page, "puka overs");
  await expect(raw.getByText("Needs a game and a market to refresh odds")).toBeVisible();
  await raw.getByRole("button", { name: "Add to slip" }).click();
  const prompt = raw.getByRole("group", { name: "Choose a slip" });
  await prompt.getByLabel("Sportsbook").fill("FanDuel");
  await prompt.getByRole("button", { name: "Create slip" }).click();

  await expect(raw.getByText("Added to Sunday Core.")).toBeVisible();
  await expect(raw.getByText("In 1 slip")).toBeVisible();
  await expect(page.getByRole("link", { name: /Sunday Core · 1 leg/ })).toBeVisible();

  // The new slip is current, so the next card adds straight to it.
  await card(page, "Kyren Williams").getByRole("button", { name: "Add to Sunday Core" }).click();
  await expect(page.getByRole("link", { name: /Sunday Core · 2 legs/ })).toBeVisible();

  await page.goto("/slip");
  await expect(slipTab(page, "Sunday Core")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("puka overs")).toBeVisible();

  // The book is remembered as the default for the next slip started.
  expect(await page.evaluate(() => window.localStorage.getItem("parlay-helper:last-sportsbook"))).toBe("FanDuel");
});

test("Add ideas on the Slip screen opens Ideas in add mode, and Done returns to the slip", async ({ page }) => {
  await seedV2(page, {
    ideas: [idea("i1", "Puka Nacua"), idea("i2", "Kyren Williams")],
    slips: [{ id: "s1", name: "Sunday Core", sportsbook: "FanDuel", ideaIds: [], updatedAt: EARLIER }],
  });
  await page.goto("/slip");
  await page.getByRole("button", { name: "Add ideas" }).click();

  await expect(page).toHaveURL(/\/ideas\?add=s1$/);
  const bar = page.getByRole("status").filter({ hasText: "Adding to Sunday Core" });
  await expect(bar).toContainText("0 legs");
  await card(page, "Puka Nacua").getByRole("button", { name: "Add to Sunday Core" }).click();
  await expect(bar).toContainText("1 leg");
  await expect(card(page, "Puka Nacua").getByText("Added", { exact: true })).toBeVisible();

  await bar.getByRole("button", { name: "Done" }).click();
  await expect(page).toHaveURL(/\/slip$/);
  await expect(page.getByText("Puka Nacua").first()).toBeVisible();
  await expect(page.getByText("Kyren Williams")).toHaveCount(0);
});

test("a placed idea is badged Placed, and Hide placed hides it without changing anything", async ({ page }) => {
  await seedV2(page, {
    ideas: [idea("i1", "Puka Nacua"), idea("i2", "Kyren Williams")],
    slips: [{ id: "s1", name: "Sunday Core", sportsbook: "FanDuel", ideaIds: ["i1"], updatedAt: EARLIER }],
  });
  await page.goto("/slip");
  await markPlaced(page);

  await page.goto("/ideas");
  await expect(card(page, "Puka Nacua").getByText("Placed", { exact: true })).toBeVisible();
  await expect(card(page, "Puka Nacua").getByText(/In \d slips?/)).toHaveCount(0);

  await page.getByLabel("Hide placed").check();
  await expect(card(page, "Puka Nacua")).toHaveCount(0);
  await expect(card(page, "Kyren Williams")).toBeVisible();

  await page.getByLabel("Hide placed").uncheck();
  await expect(card(page, "Puka Nacua")).toBeVisible();
});

test("add mode adds to its own slip even when another slip is current", async ({ page }) => {
  await seedV2(page, {
    ideas: [idea("i1", "Puka Nacua")],
    slips: [
      { id: "s1", name: "Sunday Core", sportsbook: "FanDuel", ideaIds: [], updatedAt: EARLIER },
      { id: "s2", name: "Late Slate", sportsbook: "DraftKings", ideaIds: [], updatedAt: LATER },
    ],
  });
  await page.evaluate(() => window.localStorage.setItem("parlay-helper:active-candidate-id", "s2"));

  await page.goto("/ideas");
  await expect(card(page, "Puka Nacua").getByRole("button", { name: "Add to Late Slate" })).toBeVisible();

  await page.goto("/ideas?add=s1");
  await card(page, "Puka Nacua").getByRole("button", { name: "Add to Sunday Core" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Adding to Sunday Core" })).toContainText("1 leg");
  await page.getByRole("button", { name: "Done" }).click();
  await expect(slipTab(page, "Sunday Core")).toHaveAttribute("aria-selected", "true");
});

test("with drafts but nothing current, Add offers the drafts and makes the chosen one current", async ({ page }) => {
  await seedV2(page, {
    ideas: [idea("i1", "Puka Nacua")],
    slips: [
      { id: "s1", name: "Sunday Core", sportsbook: "FanDuel", ideaIds: [], updatedAt: EARLIER },
      { id: "s2", name: "Late Slate", sportsbook: "DraftKings", ideaIds: [], updatedAt: LATER },
    ],
  });
  await page.goto("/ideas");
  // Nothing current, as right after a placement.
  await page.evaluate(() => window.localStorage.setItem("parlay-helper:active-candidate-id", "none"));
  await page.reload();
  await expect(page.getByRole("link", { name: /pick your next slip/ })).toBeVisible();

  await card(page, "Puka Nacua").getByRole("button", { name: "Add to slip" }).click();
  await card(page, "Puka Nacua").getByRole("group", { name: "Choose a slip" }).getByRole("button", { name: "Sunday Core · FanDuel" }).click();

  await expect(card(page, "Puka Nacua").getByText("Added to Sunday Core.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Sunday Core · 1 leg/ })).toBeVisible();
});
