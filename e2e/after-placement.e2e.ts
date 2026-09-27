import { expect, test } from "@playwright/test";
import { idea, seedV2 } from "./support/seed";
import { EARLIER, LATER, markPlaced, slipTab } from "./support/flows";

// Manual check 5 (chunk 5, INV-7): after Mark Placed there is no current slip
// until the user picks one. The Slip screen says the slip was placed and
// offers the other drafts; it does not silently switch to one of them.

test("after placing, the Slip screen asks which slip is next instead of silently switching to another draft", async ({ page }) => {
  await seedV2(page, {
    ideas: [idea("i1", "Puka Nacua"), idea("i2", "Cooper Kupp")],
    slips: [
      { id: "older", name: "Older draft", sportsbook: "FanDuel", ideaIds: ["i1"], updatedAt: EARLIER },
      { id: "sunday", name: "Sunday Core", sportsbook: "FanDuel", ideaIds: ["i2"], updatedAt: LATER },
    ],
  });
  await page.goto("/builder");
  await expect(slipTab(page, "Sunday Core")).toHaveAttribute("aria-selected", "true");

  await markPlaced(page);
  await page.goto("/builder");

  await expect(page.getByText("Your slip was placed and is in")).toBeVisible();
  await expect(page.getByText("Continue a draft")).toBeVisible();
  // Nothing is current: no slip tabs, no Mark Placed.
  await expect(page.getByRole("tab")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Mark Placed", exact: true })).toHaveCount(0);

  // The same state on the Ideas side.
  await page.goto("/capture");
  await expect(page.getByText("Slip placed · pick your next slip")).toBeVisible();

  // Picking the draft makes it current.
  await page.goto("/builder");
  await page.getByRole("button", { name: /^Older draft · FanDuel · 1 leg$/ }).click();
  await expect(slipTab(page, "Older draft")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: "Mark Placed", exact: true })).toBeVisible();
});
