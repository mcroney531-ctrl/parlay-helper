"use client";

import { useState } from "react";
import Link from "next/link";
import { useData } from "@/app/DataProvider";
import { Button, TextInput } from "@/components/FormControls";
import { SportsbookSupportHint } from "@/components/SportsbookSupportHint";
import { createCandidate } from "@/domain/candidates/candidateService";
import { isPlaced } from "@/domain/candidates/candidateState";

/**
 * The Slip screen when there is no current slip: right after a placement (the
 * user picks a draft or starts a new slip; nothing is chosen for them), when
 * every slip has been placed, or before the first slip ever.
 */
export function NoCurrentSlip() {
  const { candidates, finalized, lastSlipPlaced, refreshCandidates, setActiveCandidateId } = useData();
  const drafts = candidates.filter((c) => !isPlaced(c));
  const firstEver = candidates.length === 0 && finalized.length === 0;
  return (
    <div className="flex flex-col gap-4">
      {lastSlipPlaced && (
        <p role="status" className="rounded-[var(--radius-control)] px-4 py-3 text-sm" style={{ background: "var(--color-info-bg)", color: "var(--color-info)" }}>
          Your slip was placed and is in{" "}
          <Link href="/history" className="font-semibold underline">
            History
          </Link>
          . Pick a slip to keep building, or start a new one.
        </p>
      )}
      {drafts.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
            Continue a draft
          </p>
          <div className="flex flex-wrap gap-2">
            {drafts.map((draft) => (
              <Button key={draft.id} variant="secondary" onClick={() => setActiveCandidateId(draft.id)} className="!min-h-[40px] px-3.5 py-1.5 text-sm">
                {draft.name} · {draft.sportsbook} · {draft.ideaIds.length} leg{draft.ideaIds.length === 1 ? "" : "s"}
              </Button>
            ))}
          </div>
        </div>
      )}
      <NewSlipForm title={firstEver ? "Start your first slip" : "Start a new slip"} onCreated={async (id) => {
        await refreshCandidates();
        setActiveCandidateId(id);
      }} />
    </div>
  );
}

function NewSlipForm({ title, onCreated }: { title: string; onCreated: (id: string) => Promise<void> }) {
  const [name, setName] = useState("Sunday Core");
  const [sportsbook, setSportsbook] = useState("");
  const [creating, setCreating] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!sportsbook.trim() || creating) return;
    setCreating(true);
    try {
      const candidate = await createCandidate(name, sportsbook);
      await onCreated(candidate.id);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-4 rounded-[var(--radius-card)] border px-4 py-10 text-center" style={{ borderColor: "var(--color-border)" }}>
      <p className="text-base font-semibold" style={{ color: "var(--color-ink)" }}>
        {title}
      </p>
      <p className="max-w-xs text-sm" style={{ color: "var(--color-muted)" }}>
        A slip is book-specific — pick the sportsbook you&rsquo;ll actually place this on.
      </p>
      <form onSubmit={handleCreate} className="flex w-full max-w-xs flex-col gap-3">
        <label className="flex flex-col gap-1 text-left text-xs font-semibold" style={{ color: "var(--color-muted)" }}>
          Name
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Sunday Core" />
        </label>
        <label className="flex flex-col gap-1 text-left text-xs font-semibold" style={{ color: "var(--color-muted)" }}>
          Sportsbook
          <TextInput value={sportsbook} onChange={(e) => setSportsbook(e.target.value)} placeholder="FanDuel" autoFocus />
        </label>
        <SportsbookSupportHint sportsbook={sportsbook} />
        <Button type="submit" disabled={!sportsbook.trim() || creating}>
          {creating ? "Creating…" : "Create slip"}
        </Button>
      </form>
    </div>
  );
}
