import { expect, test } from "@playwright/test";
import { idea, seedV2 } from "./support/seed";
import { EARLIER, markPlaced, slipTab } from "./support/flows";

// Manual check 3 (chunk 5): a placed slip is reached from its History record.
// Clone to new slip makes a new current draft and opens it; Delete slip
// removes the slip, says the record is kept, and the record stays.

test("Clone from History opens a new current copy; Delete removes the placed slip and keeps its History record", async ({ page }) => {
  await seedV2(page, {
    ideas: [idea("i1", "Puka Nacua")],
    slips: [{ id: "s1", name: "Sunday Core", sportsbook: "FanDuel", ideaIds: ["i1"], updatedAt: EARLIER }],
  });
  await page.goto("/builder");
  await markPlaced(page);

  await page.getByRole("button", { name: "Clone to new slip" }).click();
  await expect(page).toHaveURL(/\/builder$/);
  await expect(slipTab(page, "Sunday Core (copy)")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Puka Nacua").first()).toBeVisible();

  await page.goto("/history");
  const confirmText = new Promise<string>((resolve) =>
    page.once("dialog", async (dialog) => {
      resolve(dialog.message());
      await dialog.accept();
    }),
  );
  await page.getByRole("button", { name: "Delete slip" }).click();
  expect(await confirmText).toContain("History record stays");

  await expect(page.getByRole("button", { name: "Clone to new slip" })).toHaveCount(0);
  await expect(page.getByText("1 finalized slip")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sunday Core", exact: true })).toBeVisible();

  // The clone is untouched by deleting the placed slip.
  await page.goto("/builder");
  await expect(slipTab(page, "Sunday Core (copy)")).toHaveAttribute("aria-selected", "true");
});
