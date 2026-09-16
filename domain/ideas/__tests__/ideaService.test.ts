import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import {
  archiveIdea,
  captureInstantIdea,
  captureStructuredIdea,
  listIdeas,
  unarchiveIdea,
  updateIdeaDetails,
} from "../ideaService";
import { __setDBForTests } from "@/storage/indexeddb/db";

beforeEach(() => {
  // Fresh database per test so persistence tests never leak state.
  (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  __setDBForTests(null);
});

describe("captureInstantIdea", () => {
  it("saves a raw idea with no structured fields as needs_details", async () => {
    const idea = await captureInstantIdea("Puka 80+ Sunday - like matchup");
    expect(idea.detailsStatus).toBe("needs_details");
    expect(idea.rawText).toBe("Puka 80+ Sunday - like matchup");
    expect(idea.marketKey).toBeNull();

    const all = await listIdeas();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(idea.id);
  });

  it("rejects empty text", async () => {
    await expect(captureInstantIdea("   ")).rejects.toThrow();
  });
});

describe("updateIdeaDetails", () => {
  it("can structure a needs_details idea without changing createdAt or rawText", async () => {
    const idea = await captureInstantIdea("Puka 80+ Sunday");
    const updated = await updateIdeaDetails(idea.id, {
      marketKey: "player_reception_yds",
      selection: "over",
      lineAtCapture: 80.5,
    });
    expect(updated.detailsStatus).toBe("structured");
    expect(updated.createdAt).toBe(idea.createdAt);
    expect(updated.rawText).toBe(idea.rawText);
    expect(updated.updatedAt).not.toBe(idea.updatedAt);
  });
});

describe("captureStructuredIdea", () => {
  it("saves directly as structured when market and selection are provided", async () => {
    const idea = await captureStructuredIdea("Puka O80.5 receiving yards", {
      marketKey: "player_reception_yds",
      selection: "over",
      lineAtCapture: 80.5,
      oddsAtCaptureAmerican: -110,
      sportsbookAtCapture: "FanDuel",
    });
    expect(idea.detailsStatus).toBe("structured");
  });
});

describe("archiveIdea / unarchiveIdea", () => {
  it("marks and unmarks archivedAt without deleting the record", async () => {
    const idea = await captureInstantIdea("Test idea");
    await archiveIdea(idea.id);
    let all = await listIdeas();
    expect(all[0].archivedAt).not.toBeNull();

    await unarchiveIdea(idea.id);
    all = await listIdeas();
    expect(all[0].archivedAt).toBeNull();
  });
});
