"use client";

import { useEffect, useId, useRef, useState } from "react";
import { TextInput } from "@/components/FormControls";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { sleeperHeadshotUrl } from "@/components/sleeperImage";
import { CheckCircleIcon } from "@/components/icons";

type PlayerResult = { playerId: string; fullName: string; team: string | null; position: string | null };

export function PlayerSearchField({
  playerName,
  playerId,
  onChange,
}: {
  playerName: string;
  playerId: string;
  onChange: (playerName: string, playerId: string, team?: string | null) => void;
}) {
  const [query, setQuery] = useState(playerName);
  const [results, setResults] = useState<PlayerResult[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Remembers the team shown for a resolved player, since onChange only
  // carries name+id back to the parent form (team isn't part of that
  // contract) — purely local display, never persisted.
  const [resolvedTeam, setResolvedTeam] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    const timeout = setTimeout(async () => {
      if (trimmed.length < 2) {
        setResults([]);
        setSearching(false);
        return;
      }
      setSearching(true);
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
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [query]);

  function handleTextChange(value: string) {
    setQuery(value);
    setResolvedTeam(null);
    // Free-typing after a selection invalidates that selection — never
    // keep a resolved id attached to a name the user has since changed.
    onChange(value, "");
  }

  function handleSelect(result: PlayerResult) {
    setQuery(result.fullName);
    setResolvedTeam(result.team);
    setResults([]);
    setOpen(false);
    setActiveIndex(-1);
    onChange(result.fullName, result.playerId, result.team);
  }

  function handleChangePlayer() {
    onChange("", "");
    setQuery("");
    setResolvedTeam(null);
    window.setTimeout(() => inputRef.current?.focus(), 0);
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
      e.stopPropagation(); // closing the suggestion list only — a wrapping sheet must not also close
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  // A resolved player gets its own confirmed-state card instead of leaving
  // the raw search input showing a name with no visual difference from an
  // unselected suggestion.
  if (playerId) {
    return (
      <div className="flex items-center gap-2 rounded-[var(--radius-control)] border p-2" style={{ borderColor: "var(--color-action)", background: "var(--color-selected-bg)" }}>
        <PlayerAvatar name={playerName} team={resolvedTeam} imageUrl={sleeperHeadshotUrl(playerId)} size="compact" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
            {playerName}
          </p>
          <p className="flex items-center gap-1 text-xs" style={{ color: "var(--color-action)" }}>
            <CheckCircleIcon className="h-3 w-3 shrink-0" />
            Matched to player profile
          </p>
        </div>
        <button type="button" onClick={handleChangePlayer} className="shrink-0 text-xs font-semibold underline" style={{ color: "var(--color-action)" }}>
          Change
        </button>
      </div>
    );
  }

  // Never claim "no match" while a real suggestion is on screen, or while
  // a search is still in flight — only once the lookup has genuinely
  // settled on zero results.
  const statusText = searching
    ? "Searching…"
    : open && results.length > 0
      ? ""
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
      <TextInput
        ref={inputRef}
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
      <p
        id={`${listboxId}-status`}
        role="status"
        aria-live="polite"
        className="mt-0.5 text-xs"
        style={{ color: "var(--color-muted)", minHeight: statusText ? undefined : 0 }}
      >
        {statusText}
      </p>
      {open && results.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-10 mt-1 w-full rounded-[var(--radius-control)] border shadow-sm"
          style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
        >
          {results.map((result, index) => (
            <li key={result.playerId}>
              <button
                id={`${listboxId}-option-${index}`}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                // Mouse focus-change on mousedown can fire the input's blur
                // with no relatedTarget in some browsers, which would close
                // (and unmount) this listbox before the click event lands.
                // Keeping focus on the input the whole time avoids that race.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(result)}
                onMouseEnter={() => setActiveIndex(index)}
                className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm"
                style={{ background: index === activeIndex ? "var(--color-selected-bg)" : undefined }}
              >
                <PlayerAvatar name={result.fullName} team={result.team} imageUrl={sleeperHeadshotUrl(result.playerId)} size="compact" />
                <span>
                  {result.fullName}
                  {result.team ? ` · ${result.team}` : ""}
                  {result.position ? ` · ${result.position}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
