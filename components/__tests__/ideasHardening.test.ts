import { describe, expect, it, vi } from "vitest";
import { addToNewSlip } from "@/components/addToNewSlip";
import { staleAddText } from "@/components/StaleAddNote";
import type { CandidateParlay } from "@/domain/types";

// B's 3c review: R2 (a first add whose new slip is created but whose add
// fails) and R1 (add mode for a slip that's since been placed or deleted).

describe("addToNewSlip (R2)", () => {
  const slip = { id: "s9", name: "Sunday Core" };

  it("adds the idea, makes the new slip current and reloads the slips", async () => {
    const calls: string[] = [];
    const result = await addToNewSlip(slip, "i1", {
      addLeg: async (slipId, ideaId) => void calls.push(`add ${slipId} ${ideaId}`),
      setActive: (id) => void calls.push(`active ${id}`),
      refresh: async () => void calls.push("refresh"),
    });
    expect(result).toEqual({ ok: true });
    expect(calls).toEqual(["add s9 i1", "active s9", "refresh"]);
  });

  it("when the add fails, still makes the new slip current and visible, so a retry reuses it", async () => {
    const setActive = vi.fn();
    const refresh = vi.fn(async () => {});
    const result = await addToNewSlip(slip, "i1", {
      addLeg: async () => {
        throw new Error("storage full");
      },
      setActive,
      refresh,
    });
    expect(setActive).toHaveBeenCalledWith("s9");
    expect(refresh).toHaveBeenCalledOnce();
    expect(result).toEqual({ ok: false, message: `Slip "Sunday Core" created, but this idea couldn't be added. Try Add again.` });
  });
});

describe("staleAddText (R1)", () => {
  const current = { id: "s2", name: "Late Slate" } as CandidateParlay;

  it("names a placed slip and where the cards add now", () => {
    expect(staleAddText({ slipId: "s1", placedName: "Sunday Core" }, current)).toBe("Sunday Core was placed. You're adding to Late Slate.");
  });

  it("says a deleted slip was deleted, and to pick a slip when nothing is current", () => {
    expect(staleAddText({ slipId: "s1", placedName: null }, null)).toBe("The slip you were adding to was deleted. Pick a slip when you add.");
  });
});
