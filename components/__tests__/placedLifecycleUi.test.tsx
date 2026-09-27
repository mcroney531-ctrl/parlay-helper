import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { CandidateParlay } from "@/domain/types";

const data = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock("@/app/DataProvider", () => ({ useData: () => data.value }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { IDBFactory } from "fake-indexeddb";
import { completePlacement, FinalizeSection, MarkPlacedConfirm } from "../FinalizeSection";
import { CurrentSlipTray } from "../CurrentSlipTray";
import { NoCurrentSlip } from "../NoCurrentSlip";
import { cloneToNewSlip, PlacedSlipActions } from "../PlacedSlipActions";
import { NO_CURRENT_SLIP } from "@/domain/candidates/activeCandidate";
import { addLegToCandidate, createCandidate } from "@/domain/candidates/candidateService";
import { __setDBForTests } from "@/storage/indexeddb/db";
import { getCandidate } from "@/storage/indexeddb/repositories/candidatesRepository";
import { deletePlacedSlipConfirmText } from "@/domain/history/placedSlip";

function slip(id: string, name: string, overrides: Partial<CandidateParlay> = {}): CandidateParlay {
  return {
    id,
    name,
    sportsbook: "FanDuel",
    ideaIds: ["i1", "i2"],
    stakeCents: 200,
    promoLabel: "",
    promoMaxStakeCents: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    status: "draft",
    revision: 0,
    ...overrides,
  };
}

const noop = async () => {};

beforeEach(() => {
  data.value = {};
});

describe("Mark Placed has a confirm step (INV-1)", () => {
  it("before a tap: only the Mark Placed button, no confirmation yet", () => {
    data.value = { refreshCandidates: noop, refreshFinalized: noop, setActiveCandidateId: () => {} };
    const html = renderToStaticMarkup(<FinalizeSection candidateId="s1" slipName="Sunday Core" seenRevision={0} legCount={2} />);
    expect(html).toMatch(/<button[^>]*>Mark Placed<\/button>/);
    expect(html).not.toContain("Confirm Mark Placed");
  });

  it("the confirmation names the slip and says it's permanent, with Confirm and Cancel", () => {
    const html = renderToStaticMarkup(<MarkPlacedConfirm slipName="Sunday Core" saving={false} onConfirm={() => {}} onCancel={() => {}} />);
    expect(html).toContain("Mark “Sunday Core” as placed?");
    expect(html).toContain("can’t be edited or placed again");
    expect(html).toContain("Yes, mark placed");
    expect(html).toContain("Cancel");
  });
});

describe("CurrentSlipTray says what's next when there is no current slip", () => {
  const draft = slip("d", "Other draft");
  const placed = slip("p", "Sunday Core", { status: "placed" });

  it("right after a placement, with drafts: 'Slip placed · pick your next slip'", () => {
    data.value = { activeCandidate: null, candidates: [draft, placed], finalized: [{}], lastSlipPlaced: true, loading: false };
    expect(renderToStaticMarkup(<CurrentSlipTray />)).toContain("Slip placed · pick your next slip");
  });

  it("every slip placed: 'Start a new slip' (not 'your first')", () => {
    data.value = { activeCandidate: null, candidates: [placed], finalized: [{}], lastSlipPlaced: true, loading: false };
    const html = renderToStaticMarkup(<CurrentSlipTray />);
    expect(html).toContain("Start a new slip");
    expect(html).not.toContain("first");
  });

  it("nothing at all yet: 'Start your first slip'", () => {
    data.value = { activeCandidate: null, candidates: [], finalized: [], lastSlipPlaced: false, loading: false };
    expect(renderToStaticMarkup(<CurrentSlipTray />)).toContain("Start your first slip");
  });

  it("with a current slip: its name and leg count", () => {
    data.value = { activeCandidate: draft, candidates: [draft], finalized: [], lastSlipPlaced: false, loading: false };
    expect(renderToStaticMarkup(<CurrentSlipTray />)).toContain("Other draft · 2 legs");
  });
});

describe("the Slip screen with no current slip", () => {
  it("after a placement: says so with a link to History, offers the drafts (not the placed slip) and a new slip", () => {
    const draft = slip("d", "Other draft");
    const placed = slip("p", "Sunday Core", { status: "placed" });
    data.value = {
      candidates: [draft, placed],
      finalized: [{}],
      lastSlipPlaced: true,
      refreshCandidates: noop,
      setActiveCandidateId: () => {},
    };
    const html = renderToStaticMarkup(<NoCurrentSlip />);
    expect(html).toContain("Your slip was placed and is in");
    expect(html).toContain('href="/history"');
    expect(html).toContain("Continue a draft");
    expect(html).toContain("Other draft · FanDuel · 2 legs");
    expect(html).not.toContain("Sunday Core ·");
    expect(html).toContain("Start a new slip");
  });

  it("before any slip: just 'Start your first slip', no placed banner and no draft list", () => {
    data.value = { candidates: [], finalized: [], lastSlipPlaced: false, refreshCandidates: noop, setActiveCandidateId: () => {} };
    const html = renderToStaticMarkup(<NoCurrentSlip />);
    expect(html).toContain("Start your first slip");
    expect(html).not.toContain("was placed");
    expect(html).not.toContain("Continue a draft");
  });
});

describe("History actions for a placed slip", () => {
  it("offers Clone to new slip and Delete slip", () => {
    data.value = { refreshCandidates: noop, setActiveCandidateId: () => {} };
    const html = renderToStaticMarkup(<PlacedSlipActions slip={slip("p", "Sunday Core", { status: "placed" })} />);
    expect(html).toContain("Clone to new slip");
    expect(html).toContain("Delete slip");
  });

  it("the delete confirmation says the History record is kept (INV-15)", () => {
    expect(deletePlacedSlipConfirmText("Sunday Core")).toBe(
      'Delete the slip "Sunday Core"? Its History record stays exactly as it is; you just won\'t be able to clone it from here anymore.',
    );
  });
});

describe("the lifecycle handlers, driven directly (no DOM harness in this repo)", () => {
  beforeEach(() => {
    (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
    __setDBForTests(null);
  });

  function recorder() {
    const calls: string[] = [];
    let pointer: string | null = "placed-slip";
    return {
      calls,
      pointer: () => pointer,
      deps: {
        setActiveCandidateId: (id: string | null) => {
          pointer = id;
          calls.push(`pointer:${id}`);
        },
        refreshCandidates: async () => {
          calls.push("refreshCandidates");
        },
        refreshFinalized: async () => {
          calls.push("refreshFinalized");
        },
        navigate: (href: string) => {
          calls.push(`navigate:${href}`);
        },
      },
    };
  }

  it("completePlacement: stores NO_CURRENT_SLIP, reloads slips and History, then opens History", async () => {
    const r = recorder();
    await completePlacement(r.deps);
    expect(r.pointer()).toBe(NO_CURRENT_SLIP);
    expect(r.calls).toEqual([`pointer:${NO_CURRENT_SLIP}`, "refreshCandidates", "refreshFinalized", "navigate:/history"]);
  });

  it("cloneToNewSlip: a new draft copy of the placed slip becomes the current slip, then the Slip screen opens", async () => {
    const source = await createCandidate("Sunday Core", "FanDuel");
    await addLegToCandidate(source.id, "idea-1");
    const r = recorder();

    const cloneId = await cloneToNewSlip(source.id, r.deps);

    expect(cloneId).not.toBe(source.id);
    expect(r.pointer()).toBe(cloneId);
    expect(r.calls).toEqual(["refreshCandidates", `pointer:${cloneId}`, "navigate:/builder"]);
    expect(await getCandidate(cloneId)).toMatchObject({ status: "draft", ideaIds: ["idea-1"] });
  });
});
