import { expect, test } from "@playwright/test";
import { idea, seedV2 } from "./support/seed";

// Manual check 4 (the 2215181 fix): Escape in an open player-suggestion list
// closes only the list; the details sheet stays open with the typed edit.
// Escape again (no list open) closes the sheet.

test("Escape in the player search closes the suggestions, not the sheet; a second Escape closes the sheet", async ({ page }) => {
  await page.route("**/api/sleeper?search=*", (route) =>
    route.fulfill({
      json: {
        fetchedAt: "2026-09-20T12:00:00.000Z",
        stale: false,
        warning: null,
        results: [{ playerId: "p-puka", fullName: "Puka Nacua", team: "LAR", position: "WR" }],
      },
    }),
  );
  await seedV2(page, {
    ideas: [idea("i1", "", { rawText: "puka overs", playerName: null, marketKey: null, selection: null })],
    slips: [],
  });
  await page.goto("/bucket");

  await page.getByRole("button", { name: "Complete details" }).click();
  const sheet = page.getByRole("dialog", { name: "Complete details" });
  await expect(sheet).toBeVisible();

  const player = sheet.getByRole("combobox", { name: "Player" });
  await player.fill("Puk");
  await expect(sheet.getByRole("option", { name: /Puka Nacua/ })).toBeVisible();

  await player.press("Escape");
  await expect(sheet.getByRole("listbox")).toBeHidden();
  await expect(sheet).toBeVisible();
  await expect(player).toHaveValue("Puk");

  await player.press("Escape");
  await expect(sheet).toBeHidden();
});
