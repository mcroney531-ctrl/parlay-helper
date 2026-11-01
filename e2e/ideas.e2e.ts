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

// B's 3c review, R1 and R2.

test("add mode never focuses the quick-add box, opened directly or from the Slip screen", async ({ page }) => {
  await seedV2(page, {
    ideas: [idea("i1", "Puka Nacua")],
    slips: [{ id: "s1", name: "Sunday Core", sportsbook: "FanDuel", ideaIds: [], updatedAt: EARLIER }],
  });
  await page.goto("/ideas?add=s1");
  await expect(page.getByRole("status").filter({ hasText: "Adding to Sunday Core" })).toBeVisible();
  await expect(page.getByLabel("Save the thought before it disappears.")).not.toBeFocused();

  await page.goto("/slip");
  await page.getByRole("button", { name: "Add ideas" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Adding to Sunday Core" })).toBeVisible();
  await expect(page.getByLabel("Save the thought before it disappears.")).not.toBeFocused();
});

test("add mode for a deleted slip says so, drops the query, and names where the cards add now", async ({ page }) => {
  await seedV2(page, {
    ideas: [idea("i1", "Puka Nacua")],
    slips: [{ id: "s2", name: "Late Slate", sportsbook: "DraftKings", ideaIds: [], updatedAt: LATER }],
  });
  await page.goto("/ideas?add=gone");
  await expect(page.getByRole("status").filter({ hasText: "The slip you were adding to was deleted. You're adding to Late Slate." })).toBeVisible();
  await expect(page).toHaveURL(/\/ideas$/);
  await expect(page.getByRole("status").filter({ hasText: /^Adding to/ })).toHaveCount(0);
  await expect(card(page, "Puka Nacua").getByRole("button", { name: "Add to Late Slate" })).toBeVisible();
});

test("add mode for a placed slip names it, and with nothing current says to pick a slip", async ({ page }) => {
  await seedV2(page, {
    ideas: [idea("i1", "Puka Nacua"), idea("i2", "Kyren Williams")],
    slips: [{ id: "s1", name: "Sunday Core", sportsbook: "FanDuel", ideaIds: ["i1"], updatedAt: EARLIER }],
  });
  await page.goto("/slip");
  await markPlaced(page);

  await page.goto("/ideas?add=s1");
  await expect(page.getByRole("status").filter({ hasText: "Sunday Core was placed. Pick a slip when you add." })).toBeVisible();
  await expect(page).toHaveURL(/\/ideas$/);
  await expect(card(page, "Kyren Williams").getByRole("button", { name: "Add to slip" })).toBeVisible();
});

/** Makes IndexedDB writes to the slips store fail after `left` more succeed (set on window), to reach the error paths. */
async function failSlipWritesAfter(page: Page) {
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore["put"]>) {
      const w = window as unknown as { slipWritesLeft?: number };
      if (this.name === "candidates" && w.slipWritesLeft !== undefined && w.slipWritesLeft-- <= 0) {
        throw new DOMException("Simulated write failure", "UnknownError");
      }
      return put.apply(this, args);
    };
  });
}
const setSlipWritesLeft = (page: Page, left: number | undefined) =>
  page.evaluate((n) => ((window as unknown as { slipWritesLeft?: number }).slipWritesLeft = n), left);

test("a first add whose new slip is created but whose add fails leaves that slip current, and Add retries into it", async ({ page }) => {
  await failSlipWritesAfter(page);
  await seedV2(page, { ideas: [idea("i1", "Puka Nacua")], slips: [] });
  await page.goto("/ideas");

  const puka = card(page, "Puka Nacua");
  await puka.getByRole("button", { name: "Add to slip" }).click();
  await puka.getByLabel("Sportsbook").fill("FanDuel");
  await setSlipWritesLeft(page, 1); // the create succeeds, the add doesn't
  await puka.getByRole("button", { name: "Create slip" }).click();

  await expect(puka.getByRole("alert")).toHaveText(`Slip "Sunday Core" created, but this idea couldn't be added. Try Add again.`);
  await expect(page.getByRole("link", { name: /Sunday Core · 0 legs/ })).toBeVisible();

  await setSlipWritesLeft(page, undefined);
  await puka.getByRole("button", { name: "Add to Sunday Core" }).click();
  await expect(page.getByRole("link", { name: /Sunday Core · 1 leg/ })).toBeVisible();
  await expect(puka.getByRole("alert")).toHaveCount(0);

  // One slip, not a second empty one.
  await page.goto("/slip");
  await expect(page.getByRole("tab")).toHaveCount(1);
});

test("a slip that can't be created says so, and nothing is left behind", async ({ page }) => {
  await failSlipWritesAfter(page);
  await seedV2(page, { ideas: [idea("i1", "Puka Nacua")], slips: [] });
  await page.goto("/ideas");

  const puka = card(page, "Puka Nacua");
  await puka.getByRole("button", { name: "Add to slip" }).click();
  await puka.getByLabel("Sportsbook").fill("FanDuel");
  await setSlipWritesLeft(page, 0);
  await puka.getByRole("button", { name: "Create slip" }).click();

  await expect(puka.getByRole("alert")).toHaveText("Could not create the slip: Simulated write failure");
  await expect(puka.getByRole("button", { name: "Create slip" })).toBeEnabled();
  await expect(puka.getByRole("button", { name: "Add to slip" })).toBeVisible();
});

// The quick-add box is now hydrated, not remounted (R1's Suspense note).

test("text typed into the quick-add box before the app loads is kept, and the saved draft comes back", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  await seedV2(page, { ideas: [], slips: [] });

  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/_next/static/chunks/**", async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto("/ideas", { waitUntil: "commit" });
  const box = page.getByLabel("Save the thought before it disappears.");
  await box.pressSequentially("Puka 80+ typed early");
  release();

  await expect(page.getByText("No ideas yet.")).toBeVisible();
  await expect(box).toHaveValue("Puka 80+ typed early");
  await page.unroute("**/_next/static/chunks/**");

  await page.reload();
  await expect(page.getByText("No ideas yet.")).toBeVisible();
  await expect(box).toHaveValue("Puka 80+ typed early");
  expect(errors.filter((e) => /hydrat/i.test(e))).toEqual([]);
});
