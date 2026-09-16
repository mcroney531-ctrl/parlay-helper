"use client";

import { useEffect, useId, useState } from "react";

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
  const listboxId = useId();

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
    onChange(result.fullName, result.playerId);
  }

  return (
    <div className="relative">
      <input
        className={inputClass}
        style={inputStyle}
        value={query}
        onChange={(e) => handleTextChange(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 100)}
        placeholder="Search a player…"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls={listboxId}
      />
      {playerId ? (
        <p className="mt-0.5 text-xs" style={{ color: "var(--like)" }}>
          Matched to player profile ✓
        </p>
      ) : (
        query.trim().length > 0 && (
          <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
            No player matched — status refresh won&apos;t be available for this leg.
          </p>
        )
      )}
      {open && results.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-10 mt-1 w-full rounded-md border shadow-sm"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          {results.map((result) => (
            <li key={result.playerId}>
              <button
                type="button"
                role="option"
                aria-selected={result.playerId === playerId}
                onClick={() => handleSelect(result)}
                className="block w-full px-2 py-1.5 text-left text-sm hover:opacity-80"
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
