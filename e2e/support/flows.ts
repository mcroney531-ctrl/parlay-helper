import { expect, type Page } from "@playwright/test";

/** Mark Placed on the current slip, through its confirm step, and wait for History. */
export async function markPlaced(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Mark Placed", exact: true }).click();
  await page.getByRole("button", { name: "Yes, mark placed" }).click();
  await expect(page).toHaveURL(/\/history$/);
}

/** The Slip screen's tab for a slip, by name (tabs read "<name> · <leg count>"). */
export function slipTab(page: Page, name: string) {
  return page.getByRole("tab", { name: new RegExp(`^${name.replace(/[()]/g, "\\$&")} ·`) });
}

export const EARLIER = "2026-09-20T12:00:00.000Z";
export const LATER = "2026-09-21T12:00:00.000Z";
