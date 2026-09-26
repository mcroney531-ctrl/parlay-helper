import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { CandidateParlay } from "@/domain/types";

const data = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock("@/app/DataProvider", () => ({ useData: () => data.value }));

import { CandidateSwitcher } from "../CandidateSwitcher";

function slip(id: string, name: string, overrides: Partial<CandidateParlay> = {}): CandidateParlay {
  return {
    id,
    name,
    sportsbook: "FanDuel",
    ideaIds: [],
    stakeCents: 200,
    promoLabel: "",
    promoMaxStakeCents: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("CandidateSwitcher", () => {
  it("offers drafts (and pre-v3 slips with no status) as tabs, but not placed slips (INV-7)", () => {
    data.value = {
      candidates: [
        slip("d", "Draft Slip", { status: "draft" }),
        slip("p", "Placed Slip", { status: "placed", placedAt: "2026-09-02T00:00:00.000Z" }),
        slip("l", "Legacy Slip"),
      ],
      refreshCandidates: async () => {},
    };
    const html = renderToStaticMarkup(<CandidateSwitcher activeId="d" onSelect={() => {}} />);
    expect(html).toContain("Draft Slip");
    expect(html).toContain("Legacy Slip");
    expect(html).not.toContain("Placed Slip");
  });
});
