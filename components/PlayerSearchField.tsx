"use client";

import { useEffect, useId, useRef, useState } from "react";

type PlayerResult = { playerId: string; fullName: string; team: string | null; position: string | null };

const inputClass = "w-full rounded-md border px-2 py-1.5 text-sm";
const inputStyle = { borderColor: "var(--border)", background: "var(--surface)" };

export function PlayerSearchField({
  playerName,
  playerId,
  onChange,
}: {
  playerName: string;
  playerId: string;
  onChange: (playerName: string, playerId: string) => void;
}) {
  const [query, setQuery] = useState(playerName);
  const [results, setResults] = useState<PlayerResult[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const trimmed = query.trim();
    const timeout = setTimeout(async () => {
      if (trimmed.length < 2) {
        setResults([]);
        return;
      }
      try {
        const response = await fetch(`/api/sleeper?search=${encodeURIComponent(trimmed)}`);
        if (!response.ok) return;
        const { results: found } = (await response.json()) as { results: PlayerResult[] };
        setResults(found);
        setActiveIndex(-1);
        setOpen(true);
      } catch {
        // Search is a convenience over the cached snapshot — offline or a
        // provider hiccup just means no suggestions, never a blocked field.
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [query]);

  function handleTextChange(value: string) {
    setQuery(value);
    // Free-typing after a selection invalidates that selection — never
    // keep a resolved id attached to a name the user has since changed.
    onChange(value, "");
  }

  function handleSelect(result: PlayerResult) {
    setQuery(result.fullName);
    setResults([]);
    setOpen(false);
    setActiveIndex(-1);
    onChange(result.fullName, result.playerId);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      if (activeIndex >= 0) {
        e.preventDefault();
        handleSelect(results[activeIndex]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  const statusText = playerId
    ? "Matched to player profile."
    : query.trim().length > 0
      ? "No player matched — status refresh won't be available for this leg."
      : "";

  return (
    <div
      ref={containerRef}
      className="relative"
      onBlur={(e) => {
        // Closing only when focus actually leaves this widget (not just the
        // input) is what lets a keyboard user Tab from the input into an
        // option and still have it there to activate.
        if (!containerRef.current?.contains(e.relatedTarget as Node | null)) {
          setOpen(false);
          setActiveIndex(-1);
        }
      }}
    >
      <input
        className={inputClass}
        style={inputStyle}
        value={query}
        onChange={(e) => handleTextChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder="Search a player…"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-activedescendant={activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
        aria-describedby={statusText ? `${listboxId}-status` : undefined}
      />
      <p id={`${listboxId}-status`} role="status" aria-live="polite" className="mt-0.5 text-xs" style={{ color: playerId ? "var(--like)" : "var(--muted)" }}>
        {statusText}
      </p>
      {open && results.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-10 mt-1 w-full rounded-md border shadow-sm"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          {results.map((result, index) => (
            <li key={result.playerId}>
              <button
                id={`${listboxId}-option-${index}`}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                onClick={() => handleSelect(result)}
                onMouseEnter={() => setActiveIndex(index)}
                className="block w-full px-2 py-1.5 text-left text-sm"
                style={{ background: index === activeIndex ? "var(--border)" : undefined }}
              >
                {result.fullName}
                {result.team ? ` · ${result.team}` : ""}
                {result.position ? ` · ${result.position}` : ""}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
