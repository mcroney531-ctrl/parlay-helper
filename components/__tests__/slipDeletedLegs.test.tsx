import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { FinalizedParlay } from "@/domain/types";
import type { SlipEstimate } from "@/domain/odds/estimate";
import { BuilderTray } from "../BuilderTray";
import { DeletedLegCard } from "../DeletedLegCard";
import { EstimatePanel } from "../EstimatePanel";
import { FinalizeSection, MarkPlacedConfirm, otherBookCaptureNote } from "../FinalizeSection";
import { incompleteContextNotice, RuleBanners } from "../RuleBanners";
import { unclonableRecordNote } from "@/domain/history/placedSlip";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));
vi.mock("@/app/DataProvider", () => ({
  useData: () => ({
    refreshCandidates: async () => {},
    refreshFinalized: async () => {},
    refreshIdeas: async () => {},
    refreshLiveContext: async () => {},
    setActiveCandidateId: () => {},
  }),
}));

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

describe("a slip with a deleted leg", () => {
  it("the leg says its idea was deleted and offers Remove", () => {
    const out = text(renderToStaticMarkup(<DeletedLegCard onRemove={() => {}} />));
    expect(out).toBe("Original idea deleted Remove");
  });

  it("the tray asks for the deleted leg to be removed, ahead of any unpriced count", () => {
    const out = text(
      renderToStaticMarkup(
        <BuilderTray legCount={3} estimatedOddsAmerican={null} estimatedPayoutCents={null} unpricedLegCount={1} deletedLegCount={1} expanded={false} onToggle={() => {}} />,
      ),
    );
    expect(out).toBe("3 legs 1 deleted leg to remove");
  });

  it("the estimate says why it can't be calculated", () => {
    const estimate: SlipEstimate = { ok: false, reason: "deleted_legs", unavailableLegIds: [], missingLegIds: ["x", "y"], legSources: [] };
    const out = text(renderToStaticMarkup(<EstimatePanel estimate={estimate} stakeCents={200} payoutCents={null} isSameGame={false} />));
    expect(out).toContain("Estimate cannot be calculated — 2 legs' ideas were deleted. Remove them to see an estimate.");
  });

  it("Mark Placed is blocked, with the reason, until the deleted leg is removed", () => {
    const html = renderToStaticMarkup(
      <FinalizeSection candidateId="s1" slipName="Sunday" seenRevision={0} legCount={3} unpricedLegIds={[]} deletedLegCount={1} otherBookCaptureCount={0} />,
    );
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Mark Placed<\/button>/);
    expect(text(html)).toContain("Remove the deleted leg before marking it placed.");
  });

  it("without deleted legs Mark Placed is enabled", () => {
    const html = renderToStaticMarkup(
      <FinalizeSection candidateId="s1" slipName="Sunday" seenRevision={0} legCount={3} unpricedLegIds={[]} deletedLegCount={0} otherBookCaptureCount={0} />,
    );
    expect(html).toMatch(/<button[^>]*>Mark Placed<\/button>/);
    expect(html).not.toMatch(/disabled=""[^>]*>Mark Placed/);
  });

  it("the incomplete-context notice shows even when there is no correlation or concentration signal", () => {
    const out = text(renderToStaticMarkup(<RuleBanners correlationSignals={[]} concentrationSignals={[]} legs={[]} deletedLegCount={2} />));
    expect(out).toContain("Context incomplete: 2 legs were deleted, so they aren't counted below.");
    expect(incompleteContextNotice(1)).toBe("Context incomplete: 1 leg was deleted, so it isn't counted below.");
  });

  it("with nothing deleted and no signals, there is no panel", () => {
    expect(renderToStaticMarkup(<RuleBanners correlationSignals={[]} concentrationSignals={[]} legs={[]} deletedLegCount={0} />)).toBe("");
  });
});

describe("the confirm names capture prices from another book", () => {
  it("says how many legs use a capture price from a book not confirmed to be the slip's", () => {
    expect(otherBookCaptureNote(0)).toBeNull();
    expect(otherBookCaptureNote(1)).toBe("1 leg uses a captured price from a book not confirmed to be this slip's.");
    const out = text(
      renderToStaticMarkup(
        <MarkPlacedConfirm slipName="Sunday" legCount={3} otherBookCaptureCount={2} saving={false} onConfirm={() => {}} onCancel={() => {}} />,
      ),
    );
    expect(out).toContain("2 legs use captured prices from a book not confirmed to be this slip's.");
  });
});

describe("History records that can't be cloned", () => {
  const record = (candidateId?: string) => ({ id: "r1", ...(candidateId ? { candidateId } : {}) }) as FinalizedParlay;

  it("a legacy record (no slip link) says it was placed before slip tracking", () => {
    expect(unclonableRecordNote(record(), null)).toBe("Placed before slip tracking; can't be cloned.");
  });

  it("a record whose slip was deleted says so", () => {
    expect(unclonableRecordNote(record("gone"), null)).toBe("Its slip was deleted; can't be cloned.");
  });

  it("a record whose slip still exists has no note: it can be cloned", () => {
    expect(unclonableRecordNote(record("s1"), { id: "s1" } as never)).toBeNull();
  });
});
