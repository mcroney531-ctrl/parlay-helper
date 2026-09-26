"use client";

import { useEffect, useRef, useState } from "react";
import type { CapturedIdea, Confidence } from "@/domain/types";
import { CONFIDENCE_LEVELS } from "@/domain/types";
import { SUPPORTED_LEAGUES, sportForLeague } from "@/integrations/odds-api/sportKeys";
import { CUSTOM_MARKET_VALUE, MARKET_OPTIONS, marketLabelForKey } from "@/integrations/odds-api/marketKeys";
import { PlayerSearchField } from "@/components/PlayerSearchField";
import { EventPickerField } from "@/components/EventPickerField";
import { Button, Select, TextArea, TextInput } from "@/components/FormControls";
import { CloseIcon } from "@/components/icons";
import {
  type StructuredFormValues,
  isEssentiallyComplete,
  valuesFromIdea,
} from "@/components/StructuredDetailsForm";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
      {label}
      {children}
    </label>
  );
}

/**
 * What picking a game fills in. The game says nothing about which side the
 * player is on, so a blank Team is never guessed (defaulting to either side is
 * wrong for every player on the other one). Opponent is filled only when Team
 * already names one side exactly; anything the user entered is kept.
 */
export function teamFieldsForPickedEvent(
  team: string,
  opponent: string,
  event: { homeTeam: string; awayTeam: string },
): { opponent?: string } {
  if (opponent.trim()) return {};
  if (team.trim() === event.homeTeam) return { opponent: event.awayTeam };
  if (team.trim() === event.awayTeam) return { opponent: event.homeTeam };
  return {};
}

export function IdeaDetailsSheet({
  idea,
  onClose,
  onSave,
  slipName,
  offerAddToSlip,
  onSaveAndAddToSlip,
}: {
  idea: CapturedIdea;
  onClose: () => void;
  onSave: (values: StructuredFormValues) => Promise<void> | void;
  /** Name of the current slip, for the "Save & add to <slip>" primary action. */
  slipName?: string;
  /** Whether this idea isn't already in the current slip — controls whether that combined action is offered. */
  offerAddToSlip?: boolean;
  onSaveAndAddToSlip?: (values: StructuredFormValues) => Promise<void> | void;
}) {
  const [values, setValues] = useState(() => valuesFromIdea(idea));
  const [saving, setSaving] = useState(false);
  const [customMarket, setCustomMarket] = useState(
    () => values.marketKey !== "" && !MARKET_OPTIONS.some((m) => m.key === values.marketKey),
  );
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    sheetRef.current?.focus();
  }, []);

  function set<K extends keyof StructuredFormValues>(key: K, value: StructuredFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleMarketSelect(selected: string) {
    if (selected === CUSTOM_MARKET_VALUE) {
      setCustomMarket(true);
      return;
    }
    setCustomMarket(false);
    set("marketKey", selected);
    set("marketLabel", marketLabelForKey(selected) ?? "");
  }

  const selectedMarket = MARKET_OPTIONS.find((m) => m.key === values.marketKey);
  const showLineField = customMarket || !selectedMarket || selectedMarket.requiresLine;

  async function handlePrimaryAction() {
    setSaving(true);
    try {
      // Fill sport from league automatically when not already set — no
      // separate Sport field shown, since League already implies it.
      const withDerivedSport: StructuredFormValues = {
        ...values,
        sport: values.sport.trim() || sportForLeague(values.league) || "",
      };
      if (canOfferAddToSlip && onSaveAndAddToSlip) {
        await onSaveAndAddToSlip(withDerivedSport);
      } else {
        await onSave(withDerivedSport);
      }
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    // Bubble phase on purpose: an open player/game suggestion list handles
    // Escape first and calls stopPropagation, so Escape closes that list and
    // only reaches here (closing the sheet) when no list is open. A capture
    // listener would run before the list and discard unsaved edits.
    if (e.key === "Escape") onClose();
  }

  const canOfferAddToSlip = Boolean(offerAddToSlip && slipName && isEssentiallyComplete(values));

  return (
    <div
      ref={sheetRef}
      role="dialog"
      aria-modal="true"
      aria-label={idea.detailsStatus === "needs_details" ? "Complete details" : "Edit details"}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex flex-col outline-none"
      style={{ background: "var(--color-surface)" }}
      onKeyDown={handleKeyDown}
    >
      <div
        className="flex items-center justify-between border-b px-4 py-3"
        style={{ borderColor: "var(--color-border)", background: "var(--color-canvas)" }}
      >
        <h2 className="text-lg font-bold" style={{ color: "var(--color-ink)" }}>
          {idea.detailsStatus === "needs_details" ? "Complete details" : "Edit details"}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-9 w-9 items-center justify-center rounded-full"
          style={{ color: "var(--color-muted)" }}
        >
          <CloseIcon className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <p className="mb-4 rounded-[var(--radius-control)] px-3 py-2 text-sm italic" style={{ background: "var(--color-canvas)", color: "var(--color-muted)" }}>
          &ldquo;{idea.rawText}&rdquo;
        </p>

        <div className="flex flex-col gap-4">
          <Field label="League">
            <Select value={values.league} onChange={(e) => set("league", e.target.value)}>
              <option value="">Select league</option>
              {SUPPORTED_LEAGUES.map((league) => (
                <option key={league} value={league}>
                  {league}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Player">
            <PlayerSearchField
              playerName={values.playerName}
              playerId={values.playerId}
              onChange={(name, id, team) => {
                set("playerName", name);
                set("playerId", id);
                if (team && !values.team.trim()) set("team", team);
              }}
            />
          </Field>

          <Field label="Market">
            <Select value={customMarket ? CUSTOM_MARKET_VALUE : values.marketKey} onChange={(e) => handleMarketSelect(e.target.value)}>
              <option value="">Select market</option>
              {MARKET_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
              <option value={CUSTOM_MARKET_VALUE}>Other (custom key)…</option>
            </Select>
          </Field>
          {customMarket && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Custom market key">
                <TextInput value={values.marketKey} onChange={(e) => set("marketKey", e.target.value.trim())} placeholder="provider market key" />
              </Field>
              <Field label="Custom market label">
                <TextInput value={values.marketLabel} onChange={(e) => set("marketLabel", e.target.value)} />
              </Field>
            </div>
          )}

          <Field label="Selection">
            <Select value={values.selection} onChange={(e) => set("selection", e.target.value)}>
              <option value="">Select</option>
              <option value="over">Over</option>
              <option value="under">Under</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </Select>
          </Field>

          {showLineField && (
            <Field label="Line at capture">
              <TextInput type="number" step="0.5" value={values.lineAtCapture} onChange={(e) => set("lineAtCapture", e.target.value)} placeholder="e.g. 63.5" />
            </Field>
          )}

          <details className="rounded-[var(--radius-control)] border" style={{ borderColor: "var(--color-border)" }}>
            <summary className="cursor-pointer px-3 py-2.5 text-sm font-semibold" style={{ color: "var(--color-muted)" }}>
              More details (game, odds, confidence, note)
            </summary>
            <div className="flex flex-col gap-4 border-t px-3 py-4" style={{ borderColor: "var(--color-border)" }}>
              <Field label="Team">
                <TextInput value={values.team} onChange={(e) => set("team", e.target.value)} />
              </Field>
              <Field label="Opponent">
                <TextInput value={values.opponent} onChange={(e) => set("opponent", e.target.value)} />
              </Field>
              <Field label="Game">
                <EventPickerField
                  eventId={values.eventId}
                  league={values.league}
                  onChange={(id, meta) => {
                    set("eventId", id);
                    const filled = meta ? teamFieldsForPickedEvent(values.team, values.opponent, meta) : {};
                    if (filled.opponent !== undefined) set("opponent", filled.opponent);
                  }}
                />
              </Field>
              <Field label="Slate / date">
                <TextInput type="date" value={values.slateDate} onChange={(e) => set("slateDate", e.target.value)} />
              </Field>
              <Field label="Odds at capture (American)">
                <TextInput type="number" value={values.oddsAtCaptureAmerican} onChange={(e) => set("oddsAtCaptureAmerican", e.target.value)} placeholder="-110" />
              </Field>
              <Field label="Sportsbook at capture">
                <TextInput value={values.sportsbookAtCapture} onChange={(e) => set("sportsbookAtCapture", e.target.value)} />
              </Field>
              <Field label="Confidence">
                <Select value={values.confidence} onChange={(e) => set("confidence", e.target.value as Confidence)}>
                  {CONFIDENCE_LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {level.charAt(0).toUpperCase() + level.slice(1)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Note">
                <TextArea rows={2} value={values.note} onChange={(e) => set("note", e.target.value)} />
              </Field>
            </div>
          </details>
        </div>
      </div>

      <div
        className="flex gap-2 border-t px-4 py-3"
        style={{ borderColor: "var(--color-border)", background: "var(--color-surface)", paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
          Cancel
        </Button>
        <Button type="button" onClick={handlePrimaryAction} disabled={saving} className="flex-[2]">
          {saving ? "Saving…" : canOfferAddToSlip ? `Save & add to ${slipName}` : "Save details"}
        </Button>
      </div>
    </div>
  );
}
