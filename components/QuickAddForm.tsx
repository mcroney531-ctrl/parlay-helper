"use client";

import { useEffect, useRef, useState } from "react";
import { captureInstantIdea } from "@/domain/ideas/ideaService";
import { useData } from "@/app/DataProvider";
import { Button, TextArea } from "@/components/FormControls";
import { CheckCircleIcon } from "@/components/icons";

const DRAFT_KEY = "parlay-helper:quick-add-draft";

/**
 * focusOnOpen is asked once, when the form mounts: the Ideas screen says no
 * in add mode, where the user came to pick ideas, not type one.
 */
export function QuickAddForm({ focusOnOpen = () => true }: { focusOnOpen?: () => boolean }) {
  const { refreshIdeas } = useData();
  // Empty on the first render, as in the prerendered HTML this form now
  // hydrates; the saved draft is loaded once mounted (below).
  const [text, setText] = useState("");
  const draftLoaded = useRef(false);
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const focusOnOpenRef = useRef(focusOnOpen);

  useEffect(() => {
    // Declared before the load below, so on mount it runs first and is skipped:
    // the first, empty render would otherwise delete the saved draft.
    if (!draftLoaded.current) return;
    try {
      if (text) window.localStorage.setItem(DRAFT_KEY, text);
      else window.localStorage.removeItem(DRAFT_KEY);
    } catch {
      // see the draft load below
    }
  }, [text]);

  useEffect(() => {
    // Text typed into the prerendered box before hydration wins over the
    // saved draft; either becomes the box's state.
    const typed = inputRef.current?.value ?? "";
    let saved = "";
    try {
      saved = window.localStorage.getItem(DRAFT_KEY) ?? "";
    } catch {
      // localStorage may be unavailable (private mode); draft preservation
      // is a convenience, not a requirement.
    }
    draftLoaded.current = true;
    if (typed || saved) setText(typed || saved);
    if (focusOnOpenRef.current()) inputRef.current?.focus();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      await captureInstantIdea(text);
      setText("");
      setSavedMessage("Saved to Ideas.");
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
