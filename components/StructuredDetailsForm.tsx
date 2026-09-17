"use client";

import { useState } from "react";
import type { CapturedIdea, Confidence } from "@/domain/types";
import { CONFIDENCE_LEVELS } from "@/domain/types";
import { SUPPORTED_LEAGUES } from "@/integrations/odds-api/sportKeys";
import { CUSTOM_MARKET_VALUE, MARKET_OPTIONS, marketLabelForKey } from "@/integrations/odds-api/marketKeys";
import { PlayerSearchField } from "@/components/PlayerSearchField";
import { EventPickerField } from "@/components/EventPickerField";
import { Button, Select, TextInput } from "@/components/FormControls";

export type StructuredFormValues = {
  sport: string;
  league: string;
  slateDate: string;
  playerName: string;
  playerId: string;
  team: string;
  opponent: string;
  eventId: string;
  marketKey: string;
  marketLabel: string;
  selection: string;
  lineAtCapture: string;
  oddsAtCaptureAmerican: string;
  sportsbookAtCapture: string;
  confidence: Confidence;
  note: string;
};

export function valuesFromIdea(idea: CapturedIdea): StructuredFormValues {
  return {
    sport: idea.sport ?? "",
    league: idea.league ?? "",
    slateDate: idea.slateDate ?? "",
    playerName: idea.playerName ?? "",
    playerId: idea.playerId ?? "",
    team: idea.team ?? "",
    opponent: idea.opponent ?? "",
    eventId: idea.eventId ?? "",
    marketKey: idea.marketKey ?? "",
    marketLabel: idea.marketLabel ?? "",
    selection: idea.selection ?? "",
    lineAtCapture: idea.lineAtCapture?.toString() ?? "",
    oddsAtCaptureAmerican: idea.oddsAtCaptureAmerican?.toString() ?? "",
    sportsbookAtCapture: idea.sportsbookAtCapture ?? "",
    confidence: idea.confidence,
    note: idea.note,
  };
}

export function valuesToPatch(values: StructuredFormValues): Partial<CapturedIdea> {
  return {
    sport: values.sport.trim() || null,
    league: values.league.trim() || null,
    slateDate: values.slateDate.trim() || null,
    playerName: values.playerName.trim() || null,
    playerId: values.playerId.trim() || null,
    team: values.team.trim() || null,
    opponent: values.opponent.trim() || null,
    eventId: values.eventId.trim() || null,
    marketKey: values.marketKey.trim() || null,
    marketLabel: values.marketLabel.trim() || null,
    selection: values.selection.trim() || null,
    lineAtCapture: values.lineAtCapture.trim() ? Number(values.lineAtCapture) : null,
    oddsAtCaptureAmerican: values.oddsAtCaptureAmerican.trim() ? Number(values.oddsAtCaptureAmerican) : null,
    sportsbookAtCapture: values.sportsbookAtCapture.trim() || null,
    confidence: values.confidence,
    note: values.note,
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: "var(--color-muted)" }}>
      {label}
      {children}
    </label>
  );
}

export function StructuredDetailsForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: StructuredFormValues;
  onSave: (values: StructuredFormValues) => Promise<void> | void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [customMarket, setCustomMarket] = useState(
    () => initial.marketKey !== "" && !MARKET_OPTIONS.some((m) => m.key === initial.marketKey),
  );

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(values);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3 border-t pt-3 mt-3 sm:grid-cols-3" style={{ borderColor: "var(--color-border)" }}>
      <Field label="Player">
        <PlayerSearchField
          playerName={values.playerName}
          playerId={values.playerId}
          onChange={(name, id) => {
            set("playerName", name);
            set("playerId", id);
          }}
        />
      </Field>
      <Field label="Team">
        <TextInput value={values.team} onChange={(e) => set("team", e.target.value)} />
      </Field>
      <Field label="Opponent">
        <TextInput value={values.opponent} onChange={(e) => set("opponent", e.target.value)} />
      </Field>
      <Field label="League">
        <Select value={values.league} onChange={(e) => set("league", e.target.value)}>
          <option value="">—</option>
          {SUPPORTED_LEAGUES.map((league) => (
            <option key={league} value={league}>
              {league}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Sport">
        <TextInput value={values.sport} onChange={(e) => set("sport", e.target.value)} />
      </Field>
      <Field label="Slate / date">
        <TextInput type="date" value={values.slateDate} onChange={(e) => set("slateDate", e.target.value)} />
      </Field>
      <Field label="Game">
        <EventPickerField
          eventId={values.eventId}
          league={values.league}
          onChange={(id, meta) => {
            set("eventId", id);
            if (meta && !values.team.trim()) set("team", meta.awayTeam);
            if (meta && !values.opponent.trim()) set("opponent", meta.homeTeam);
          }}
        />
      </Field>
      <Field label="Market">
        <Select value={customMarket ? CUSTOM_MARKET_VALUE : values.marketKey} onChange={(e) => handleMarketSelect(e.target.value)}>
          <option value="">—</option>
          {MARKET_OPTIONS.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
          <option value={CUSTOM_MARKET_VALUE}>Other (custom key)…</option>
        </Select>
      </Field>
      {customMarket && (
        <>
          <Field label="Custom market key">
            <TextInput
              value={values.marketKey}
              onChange={(e) => set("marketKey", e.target.value.trim())}
              placeholder="provider market key"
            />
          </Field>
          <Field label="Custom market label">
            <TextInput value={values.marketLabel} onChange={(e) => set("marketLabel", e.target.value)} />
          </Field>
        </>
      )}
      <Field label="Selection">
        <Select value={values.selection} onChange={(e) => set("selection", e.target.value)}>
          <option value="">—</option>
          <option value="over">Over</option>
          <option value="under">Under</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </Select>
      </Field>
      <Field label="Line at capture">
        <TextInput type="number" step="0.5" value={values.lineAtCapture} onChange={(e) => set("lineAtCapture", e.target.value)} />
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
        <TextInput value={values.note} onChange={(e) => set("note", e.target.value)} />
      </Field>

      <div className="col-span-full flex gap-2 pt-1">
        <Button type="submit" disabled={saving} className="!min-h-[40px] px-3 py-1.5">
          {saving ? "Saving…" : "Save details"}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} className="!min-h-[40px] px-3 py-1.5">
          Cancel
        </Button>
      </div>
    </form>
  );
}
