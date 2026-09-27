import { expect, test } from "@playwright/test";
import { idea, seedV2 } from "./support/seed";

// Manual check 1 (INV-14): the v2 -> v3 upgrade with another tab still open on
// the old version. The new tab must say why it's waiting instead of sitting on
// "Loading" forever, and finish the upgrade, data intact, once the old tab goes.

const BLOCKED = "Close any other Parlay Helper tabs or windows to finish updating your saved data.";

test("an old tab holding the v2 database blocks the upgrade with a message; closing it finishes the upgrade with the data intact", async ({
  context,
}) => {
  const oldTab = await context.newPage();
  await seedV2(oldTab, { ideas: [idea("idea-1", "Puka Nacua")], slips: [] }, { keepOpen: true });

  const newTab = await context.newPage();
  await newTab.goto("/bucket");
  await expect(newTab.getByText(BLOCKED)).toBeVisible();
  await expect(newTab.getByText("Puka Nacua over 63.5 receiving yards")).toHaveCount(0);

  await oldTab.close();

  await expect(newTab.getByText(BLOCKED)).toBeHidden();
  await expect(newTab.getByText("Puka Nacua over 63.5 receiving yards")).toBeVisible();
  const version = await newTab.evaluate(
    async () => (await indexedDB.databases()).find((db) => db.name === "parlay-helper")?.version,
  );
  expect(version).toBe(3);
});
