"use client";

import { useState } from "react";
import type { CapturedIdea, Confidence } from "@/domain/types";
import { CONFIDENCE_LEVELS } from "@/domain/types";
import { SUPPORTED_LEAGUES } from "@/integrations/odds-api/sportKeys";
import { CUSTOM_MARKET_VALUE, MARKET_OPTIONS, marketLabelForKey } from "@/integrations/odds-api/marketKeys";

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

const inputClass = "w-full rounded-md border px-2 py-1.5 text-sm";
const inputStyle = { borderColor: "var(--border)", background: "var(--surface)" };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium" style={{ color: "var(--muted)" }}>
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
    <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3 pt-3 sm:grid-cols-3">
      <Field label="Player">
        <input className={inputClass} style={inputStyle} value={values.playerName} onChange={(e) => set("playerName", e.target.value)} />
      </Field>
      <Field label="Player ID (Sleeper)">
        <input
          className={inputClass}
          style={inputStyle}
          value={values.playerId}
          onChange={(e) => set("playerId", e.target.value)}
          placeholder="e.g. 9509"
        />
      </Field>
      <Field label="Team">
        <input className={inputClass} style={inputStyle} value={values.team} onChange={(e) => set("team", e.target.value)} />
      </Field>
      <Field label="Opponent">
        <input className={inputClass} style={inputStyle} value={values.opponent} onChange={(e) => set("opponent", e.target.value)} />
      </Field>
      <Field label="League">
        <select className={inputClass} style={inputStyle} value={values.league} onChange={(e) => set("league", e.target.value)}>
          <option value="">—</option>
          {SUPPORTED_LEAGUES.map((league) => (
            <option key={league} value={league}>
              {league}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Sport">
        <input className={inputClass} style={inputStyle} value={values.sport} onChange={(e) => set("sport", e.target.value)} />
      </Field>
      <Field label="Slate / date">
        <input type="date" className={inputClass} style={inputStyle} value={values.slateDate} onChange={(e) => set("slateDate", e.target.value)} />
      </Field>
      <Field label="Event ID">
        <input className={inputClass} style={inputStyle} value={values.eventId} onChange={(e) => set("eventId", e.target.value)} placeholder="Odds API event id" />
      </Field>
      <Field label="Market">
        <select
          className={inputClass}
          style={inputStyle}
          value={customMarket ? CUSTOM_MARKET_VALUE : values.marketKey}
          onChange={(e) => handleMarketSelect(e.target.value)}
        >
          <option value="">—</option>
          {MARKET_OPTIONS.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
          <option value={CUSTOM_MARKET_VALUE}>Other (custom key)…</option>
        </select>
      </Field>
      {customMarket && (
        <>
          <Field label="Custom market key">
            <input
              className={inputClass}
              style={inputStyle}
              value={values.marketKey}
              onChange={(e) => set("marketKey", e.target.value.trim())}
              placeholder="provider market key"
            />
          </Field>
          <Field label="Custom market label">
            <input className={inputClass} style={inputStyle} value={values.marketLabel} onChange={(e) => set("marketLabel", e.target.value)} />
          </Field>
        </>
      )}
      <Field label="Selection">
        <select className={inputClass} style={inputStyle} value={values.selection} onChange={(e) => set("selection", e.target.value)}>
          <option value="">—</option>
          <option value="over">Over</option>
          <option value="under">Under</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      </Field>
      <Field label="Line at capture">
        <input type="number" step="0.5" className={inputClass} style={inputStyle} value={values.lineAtCapture} onChange={(e) => set("lineAtCapture", e.target.value)} />
      </Field>
      <Field label="Odds at capture (American)">
        <input type="number" className={inputClass} style={inputStyle} value={values.oddsAtCaptureAmerican} onChange={(e) => set("oddsAtCaptureAmerican", e.target.value)} placeholder="-110" />
      </Field>
      <Field label="Sportsbook at capture">
        <input className={inputClass} style={inputStyle} value={values.sportsbookAtCapture} onChange={(e) => set("sportsbookAtCapture", e.target.value)} />
      </Field>
      <Field label="Confidence">
        <select className={inputClass} style={inputStyle} value={values.confidence} onChange={(e) => set("confidence", e.target.value as Confidence)}>
          {CONFIDENCE_LEVELS.map((level) => (
            <option key={level} value={level}>
              {level}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Note">
        <input className={inputClass} style={inputStyle} value={values.note} onChange={(e) => set("note", e.target.value)} />
      </Field>

      <div className="col-span-full flex gap-2 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="min-h-[40px] rounded-md px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
          style={{ background: "var(--accent)", color: "var(--accent-foreground)" }}
        >
          {saving ? "Saving…" : "Save details"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-[40px] rounded-md border px-3 py-1.5 text-sm font-medium"
          style={{ borderColor: "var(--border)" }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
