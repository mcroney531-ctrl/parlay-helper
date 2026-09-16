"use client";

import { useEffect, useRef, useState } from "react";
import { captureInstantIdea } from "@/domain/ideas/ideaService";
import { useData } from "@/app/DataProvider";

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
      <label htmlFor="quick-add" className="text-sm font-medium">
        What&apos;s the idea?
      </label>
      <textarea
        id="quick-add"
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Puka 80+ Sunday — like matchup"
        rows={3}
        className="w-full rounded-lg border p-3 text-base"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        autoFocus
      />
      <button
        type="submit"
        disabled={!text.trim() || saving}
        className="min-h-[44px] rounded-lg px-4 py-2 text-base font-semibold disabled:opacity-50"
        style={{ background: "var(--accent)", color: "var(--accent-foreground)" }}
      >
        {saving ? "Saving…" : "Save"}
      </button>
      <p aria-live="polite" className="text-sm" style={{ color: "var(--muted)" }}>
        {savedMessage}
      </p>
      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--danger-foreground)" }}>
          {error}
        </p>
      )}
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        No field is required. Anything you save can be structured later from the Bucket.
      </p>
    </form>
  );
}
