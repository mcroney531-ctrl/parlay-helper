import { expect, test } from "@playwright/test";
import { idea, seedV2 } from "./support/seed";
import { EARLIER } from "./support/flows";

// Manual check 2 (chunk 2's blur race): type a new stake and tap Mark Placed.
// The tap blurs the stake field, which saves the stake and bumps the slip's
// revision after the button was rendered. Placement must count that same-tab
// save as seen and place the slip, first try, with the new stake.

test("typing a new stake and tapping Mark Placed places the slip with that stake, on the first try", async ({ page }) => {
  await seedV2(page, {
    ideas: [idea("i1", "Puka Nacua")],
    slips: [{ id: "s1", name: "Sunday Core", sportsbook: "FanDuel", ideaIds: ["i1"], updatedAt: EARLIER }],
  });
  await page.goto("/builder");

  await page.getByLabel("Stake", { exact: true }).fill("7.50");
  // One tap: the field blurs (its save starts), then Mark Placed is pressed
  // and confirmed straight away, before the saved slip has been reloaded.
  await page.getByRole("button", { name: "Mark Placed", exact: true }).click();
  await page.getByRole("button", { name: "Yes, mark placed" }).click();

  await expect(page).toHaveURL(/\/history$/);
  await expect(page.getByText("stake $7.50")).toBeVisible();
});

// The realistic sequence above usually gives the stake save time to finish
// before "Yes" is tapped, so it would pass even without the fix. This one pins
// the worst case: both taps land while the save is still in flight. Between
// the steps it yields only microtasks, which lets React render the confirm
// step, but not IndexedDB, whose callbacks are tasks, so the save can't have
// finished when placement starts.
test("worst case: Mark Placed and its confirm both land before the stake save finishes; the slip is still placed with the new stake", async ({
  page,
}) => {
  await seedV2(page, {
    ideas: [idea("i1", "Puka Nacua")],
    slips: [{ id: "s1", name: "Sunday Core", sportsbook: "FanDuel", ideaIds: ["i1"], updatedAt: EARLIER }],
  });
  await page.goto("/builder");

  const stake = page.getByLabel("Stake", { exact: true });
  await stake.fill("7.50");
  const confirmedWhileSaving = await stake.evaluate(async (input) => {
    const microtasks = async (n: number) => {
      for (let i = 0; i < n; i++) await Promise.resolve();
    };
    const button = (name: string) =>
      [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === name) as HTMLButtonElement | undefined;
    (input as HTMLInputElement).blur(); // the tap's blur: the stake save starts
    button("Mark Placed")?.click();
    for (let i = 0; i < 50 && !button("Yes, mark placed"); i++) await microtasks(1);
    const yes = button("Yes, mark placed");
    yes?.click();
    return Boolean(yes);
  });
  expect(confirmedWhileSaving).toBe(true);

  await expect(page).toHaveURL(/\/history$/);
  await expect(page.getByText("stake $7.50")).toBeVisible();
});
