"use client";

import { useState } from "react";
import Link from "next/link";
import type { CandidateParlay, CapturedIdea } from "@/domain/types";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { sleeperHeadshotUrl } from "@/components/sleeperImage";
import { Pill } from "@/components/StatusChip";
import { Button, Select } from "@/components/FormControls";
import { CheckIcon } from "@/components/icons";
import { IdeaDetailsSheet } from "@/components/IdeaDetailsSheet";
import { saveOptionsFor, valuesToPatch, type StructuredFormValues } from "@/components/StructuredDetailsForm";
import { archiveIdea, unarchiveIdea, updateIdeaDetails } from "@/domain/ideas/ideaService";
import { addLegToCandidate } from "@/domain/candidates/candidateService";
import { isPlaced } from "@/domain/candidates/candidateState";
import { draftSlipCount, isIdeaPlaced, type IdeaUsage } from "@/domain/ideas/ideaUsage";
import { missingDetailsText } from "@/domain/odds/refreshability";
import { FirstAddPrompt } from "@/components/FirstAddPrompt";
import { useData } from "@/app/DataProvider";

/** The usage badges for an idea, from the one shared usage result (so they always agree with Hide placed). */
export function usageBadges(usage: IdeaUsage, ideaId: string): string[] {
  const badges: string[] = [];
  if (isIdeaPlaced(usage, ideaId)) badges.push("Placed");
  const drafts = draftSlipCount(usage, ideaId);
  if (drafts > 0) badges.push(`In ${drafts} slip${drafts === 1 ? "" : "s"}`);
  return badges;
}

/**
 * An idea on the Ideas screen. Its primary action is adding it to the
 * target slip: the slip being filled in add mode, otherwise the current
 * slip. Adding is never gated on details (chunk 3 decision (b)); the card
 * names what's missing for live odds instead. With no current slip, Add
 * opens an inline prompt to continue a draft or start a slip.
 */
export function IdeaCard({ idea, usage, targetSlip }: { idea: CapturedIdea; usage: IdeaUsage; targetSlip: CandidateParlay | null }) {
  const { refreshIdeas, refreshCandidates, refreshLiveContext, candidates } = useData();
  const [editing, setEditing] = useState(false);
  const [choosingSlip, setChoosingSlip] = useState(false);
  const [addingToOther, setAddingToOther] = useState(false);
  const [otherCandidateId, setOtherCandidateId] = useState("");
  const [addedMessage, setAddedMessage] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);

  const targetSlipId = targetSlip?.id ?? null;
  const inTargetSlip = Boolean(targetSlip?.ideaIds.includes(idea.id));
  // A placed slip can't take new legs (INV-2).
  const otherCandidates = candidates.filter((c) => c.id !== targetSlipId && !isPlaced(c));
  const missingDetails = missingDetailsText(idea);
  const badges = usageBadges(usage, idea.id);

  function flash(message: string) {
    setAddedMessage(message);
    window.setTimeout(() => setAddedMessage(null), 2000);
  }

  async function saveDetails(values: StructuredFormValues) {
    await updateIdeaDetails(idea.id, valuesToPatch(values), saveOptionsFor(values));
    await Promise.all([refreshIdeas(), refreshLiveContext()]);
    setEditing(false);
  }

  async function saveDetailsAndAddToSlip(values: StructuredFormValues) {
    await updateIdeaDetails(idea.id, valuesToPatch(values), saveOptionsFor(values));
    await Promise.all([refreshIdeas(), refreshLiveContext()]);
    if (targetSlipId) await addLegToCandidate(targetSlipId, idea.id);
    await refreshCandidates();
    setEditing(false);
  }

  async function handleArchiveToggle() {
    if (idea.archivedAt) await unarchiveIdea(idea.id);
    else await archiveIdea(idea.id);
    await refreshIdeas();
  }

  async function handleAddToTargetSlip() {
    if (!targetSlipId) return;
    setAddError(null);
    try {
      await addLegToCandidate(targetSlipId, idea.id);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Could not add this idea to the slip.");
    }
    await refreshCandidates();
  }

  async function handleAddToOther() {
    if (!otherCandidateId) return;
    await addLegToCandidate(otherCandidateId, idea.id);
    await refreshCandidates();
    const candidate = candidates.find((c) => c.id === otherCandidateId);
    flash(`Added to ${candidate?.name ?? "slip"}.`);
    setAddingToOther(false);
  }

  const summary = [idea.playerName, idea.team, idea.marketLabel, idea.selection, idea.lineAtCapture]
    .filter((v) => v !== null && v !== undefined && v !== "")
    .join(" · ");

  return (
    <li>
      <div
        className="rounded-[var(--radius-card)] border-l-[3px] border-y border-r p-3"
        style={{
          borderColor: "var(--color-border)",
          borderLeftColor: missingDetails ? "var(--color-caution-fg)" : "var(--color-border)",
          background: "var(--color-surface)",
          opacity: idea.archivedAt ? 0.6 : 1,
        }}
      >
        <div className="flex items-start gap-3">
          <PlayerAvatar name={idea.playerName} team={idea.team} imageUrl={sleeperHeadshotUrl(idea.playerId)} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
              {idea.rawText}
            </p>
            {summary && (
              <p className="text-sm" style={{ color: "var(--color-muted)" }}>
                {summary}
              </p>
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {missingDetails && <Pill tone="caution">{missingDetails}</Pill>}
              {idea.detailsStatus !== "needs_details" && <ConfidenceBadge confidence={idea.confidence} />}
              {badges.map((badge) => (
                <Pill key={badge} tone={badge === "Placed" ? "info" : "neutral"}>
                  {badge}
                </Pill>
              ))}
              {idea.archivedAt && <Pill tone="neutral">Archived</Pill>}
              <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                {new Date(idea.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </span>
            </div>
            {idea.note && (
              <p className="mt-1 text-xs italic" style={{ color: "var(--color-muted)" }}>
                {idea.note}
              </p>
            )}
          </div>
        </div>

        {!idea.archivedAt && (
          <div className="mt-2.5 flex items-center gap-2 border-t pt-2.5" style={{ borderColor: "var(--color-border)" }}>
            {inTargetSlip ? (
              <>
                <Pill tone="success" icon={<CheckIcon className="h-3 w-3" />}>
                  Added
                </Pill>
                <Link href="/slip" className="text-sm font-semibold" style={{ color: "var(--color-action)" }}>
                  View slip →
                </Link>
              </>
            ) : targetSlip ? (
              <Button onClick={handleAddToTargetSlip} className="!min-h-[36px] flex-1 px-3 py-1.5 text-sm">
                Add to {targetSlip.name}
              </Button>
            ) : (
              <Button onClick={() => setChoosingSlip((v) => !v)} aria-expanded={choosingSlip} className="!min-h-[36px] flex-1 px-3 py-1.5 text-sm">
                Add to slip
              </Button>
            )}
          </div>
        )}

        {choosingSlip && !targetSlip && !idea.archivedAt && (
          <FirstAddPrompt
            ideaId={idea.id}
            onCancel={() => setChoosingSlip(false)}
            onDone={(slipName) => {
              setChoosingSlip(false);
              flash(`Added to ${slipName}.`);
            }}
            onFailed={(message) => {
              setChoosingSlip(false);
              setAddError(message);
            }}
          />
        )}

        {addError && (
          <p role="alert" className="mt-1 text-xs" style={{ color: "var(--color-danger)" }}>
            {addError}
          </p>
        )}

        {addedMessage && (
          <p aria-live="polite" className="mt-1 text-xs font-medium" style={{ color: "var(--color-action)" }}>
            {addedMessage}
          </p>
        )}

        <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs">
          <Button variant="text" onClick={() => setEditing(true)} className="text-xs">
            {idea.detailsStatus === "needs_details" ? "Complete details" : "Edit details"}
          </Button>
          <Button variant="text" onClick={handleArchiveToggle} className="text-xs" style={{ color: "var(--color-muted)" }}>
            {idea.archivedAt ? "Unarchive" : "Archive"}
          </Button>
          {!idea.archivedAt && otherCandidates.length > 0 && (
            <Button variant="text" onClick={() => setAddingToOther((v) => !v)} className="text-xs" style={{ color: "var(--color-muted)" }}>
              Add to another slip
            </Button>
          )}
        </div>

        {addingToOther && (
          <div className="mt-2 flex items-center gap-2">
            <Select value={otherCandidateId} onChange={(e) => setOtherCandidateId(e.target.value)} className="w-auto py-1.5 text-xs" aria-label="Choose a slip">
              <option value="">Choose a slip…</option>
              {otherCandidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Button onClick={handleAddToOther} disabled={!otherCandidateId} className="!min-h-[32px] px-2.5 py-1 text-xs">
              Add
            </Button>
          </div>
        )}
      </div>

      {editing && (
        <IdeaDetailsSheet
          idea={idea}
          onClose={() => setEditing(false)}
          onSave={saveDetails}
          slipName={targetSlip?.name}
          offerAddToSlip={!inTargetSlip && Boolean(targetSlipId)}
          onSaveAndAddToSlip={saveDetailsAndAddToSlip}
        />
      )}
    </li>
  );
}
