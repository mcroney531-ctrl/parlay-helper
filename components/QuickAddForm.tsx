"use client";

import { useEffect, useRef, useState } from "react";
import { captureInstantIdea } from "@/domain/ideas/ideaService";
import { useData } from "@/app/DataProvider";
import { Button, TextArea } from "@/components/FormControls";
import { CheckCircleIcon } from "@/components/icons";

const DRAFT_KEY = "parlay-helper:quick-add-draft";

export function QuickAddForm() {
  const { refreshIdeas } = useData();
  const [text, setText] = useState(() => {
    try {
      return window.localStorage.getItem(DRAFT_KEY) ?? "";
    } catch {
      // localStorage may be unavailable (private mode); draft preservation
      // is a convenience, not a requirement.
      return "";
    }
  });
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      if (text) window.localStorage.setItem(DRAFT_KEY, text);
      else window.localStorage.removeItem(DRAFT_KEY);
    } catch {
      // see above
    }
  }, [text]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      await captureInstantIdea(text);
      setText("");
      setSavedMessage("Saved to Bucket.");
      await refreshIdeas();
      inputRef.current?.focus();
      window.setTimeout(() => setSavedMessage(null), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save idea.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div>
        <p className="text-xs font-bold tracking-wide" style={{ color: "var(--color-action)" }}>
          QUICK ADD
        </p>
        <label htmlFor="quick-add" className="mt-1 block text-xl font-bold" style={{ color: "var(--color-ink)" }}>
          Save the thought before it disappears.
        </label>
        <p className="text-sm" style={{ color: "var(--color-muted)" }}>
          No fields required. Add the details when you have them.
        </p>
      </div>
      <TextArea
        id="quick-add"
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Puka 80+ Sunday — like matchup"
        rows={3}
        className="text-base"
        style={{ background: "var(--color-canvas)" }}
        autoFocus
      />
      <Button type="submit" disabled={!text.trim() || saving} className="w-full">
        {saving ? "Saving…" : "Save idea"}
      </Button>
      <p aria-live="polite" className="text-sm font-medium" style={{ color: "var(--color-action)", minHeight: "1.25rem" }}>
        {savedMessage}
      </p>
      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--color-danger)" }}>
          {error}
        </p>
      )}
      <p className="flex items-center gap-1.5 text-sm" style={{ color: "var(--color-muted)" }}>
        <CheckCircleIcon className="h-4 w-4 shrink-0" style={{ color: "var(--color-action)" }} />
        Draft stays on this device
      </p>
    </form>
  );
}
