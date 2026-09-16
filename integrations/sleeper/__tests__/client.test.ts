import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSleeperSnapshot, __setSnapshotForTests } from "../client";

beforeEach(() => {
  __setSnapshotForTests(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getSleeperSnapshot", () => {
  it("fetches and normalizes on first call", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          "1234": { full_name: "Puka Nacua", team: "LAR", position: "WR", status: "Active" },
        }),
        { status: 200 },
      ),
    );
    const { snapshot, stale } = await getSleeperSnapshot();
    expect(stale).toBe(false);
    expect(snapshot.players["1234"]).toMatchObject({ fullName: "Puka Nacua", team: "LAR", status: "Active" });
  });

  it("does not refetch when the cache is fresh", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 }),
    );
    await getSleeperSnapshot();
    await getSleeperSnapshot();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("falls back to a stale cached snapshot instead of throwing when the refetch fails", async () => {
    __setSnapshotForTests({ fetchedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(), players: { "1": { playerId: "1", fullName: "X", team: null, position: null, status: null, depthChartPosition: null } } });
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    const { snapshot, stale, error } = await getSleeperSnapshot();
    expect(stale).toBe(true);
    expect(error).toBeTruthy();
    expect(snapshot.players["1"].fullName).toBe("X");
  });
});
