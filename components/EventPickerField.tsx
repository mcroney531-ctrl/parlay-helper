"use client";

import { useEffect, useId, useRef, useState } from "react";

type EventOption = { eventId: string; commenceTime: string; homeTeam: string; awayTeam: string };

const inputClass = "w-full rounded-md border px-2 py-1.5 text-sm";
const inputStyle = { borderColor: "var(--border)", background: "var(--surface)" };

function formatMatchup(event: EventOption): string {
  const date = new Date(event.commenceTime);
  const when = Number.isNaN(date.getTime()) ? "" : ` — ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  return `${event.awayTeam} @ ${event.homeTeam}${when}`;
}

export function EventPickerField({
  eventId,
  league,
  onChange,
}: {
  eventId: string;
  league: string;
  onChange: (eventId: string, meta?: { homeTeam: string; awayTeam: string }) => void;
}) {
  const [events, setEvents] = useState<EventOption[]>([]);
  const [status, setStatus] = useState<"loading" | "ok" | "unavailable">("loading");
  const [filter, setFilter] = useState("");
  const [manualMode, setManualMode] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!league) return; // rendered directly from the `league` prop below, nothing to fetch
    let cancelled = false;
    (async () => {
      setStatus("loading");
      try {
        const response = await fetch(`/api/events?league=${encodeURIComponent(league)}`);
        const data = (await response.json()) as { status: string; events: EventOption[] };
        if (cancelled) return;
        if (data.status === "ok") {
          setEvents(data.events);
          setStatus("ok");
        } else {
          setEvents([]);
          setStatus("unavailable");
        }
      } catch {
        if (!cancelled) setStatus("unavailable");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [league]);

  const selected = events.find((e) => e.eventId === eventId);
  const filtered =
    filter.trim().length === 0
      ? events
      : events.filter((e) => formatMatchup(e).toLowerCase().includes(filter.trim().toLowerCase()));
  const open = !selected && filter.trim().length > 0;

  function selectEvent(event: EventOption) {
    setFilter("");
    setActiveIndex(-1);
    onChange(event.eventId, { homeTeam: event.homeTeam, awayTeam: event.awayTeam });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || filtered.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % filtered.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? filtered.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      if (activeIndex >= 0) {
        e.preventDefault();
        selectEvent(filtered[activeIndex]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setFilter("");
      setActiveIndex(-1);
    }
  }

  if (manualMode) {
    return (
      <div>
        <label className="sr-only" htmlFor={`${listboxId}-manual`}>
          Event id
        </label>
        <input
          id={`${listboxId}-manual`}
          className={inputClass}
          style={inputStyle}
          value={eventId}
          onChange={(e) => onChange(e.target.value.trim())}
          placeholder="Odds API event id"
        />
        <button type="button" onClick={() => setManualMode(false)} className="mt-0.5 text-xs underline" style={{ color: "var(--accent)" }}>
          Search games instead
        </button>
      </div>
    );
  }

  if (!league) {
    return (
      <p role="status" className="text-xs" style={{ color: "var(--muted)" }}>
        Select a league to look up games.
      </p>
    );
  }

  if (status === "loading") {
    return (
      <p role="status" aria-live="polite" className="text-xs" style={{ color: "var(--muted)" }}>
        Loading games…
      </p>
    );
  }

  if (status === "unavailable") {
    return (
      <div>
        <p role="status" aria-live="polite" className="text-xs" style={{ color: "var(--muted)" }}>
          Game lookup unavailable right now — you can leave this blank or{" "}
          <button type="button" onClick={() => setManualMode(true)} className="underline" style={{ color: "var(--accent)" }}>
            enter an event id manually
          </button>
          .
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative"
      onBlur={(e) => {
        if (!containerRef.current?.contains(e.relatedTarget as Node | null)) {
          setActiveIndex(-1);
        }
      }}
    >
      <input
        className={inputClass}
        style={inputStyle}
        value={selected ? formatMatchup(selected) : filter}
        onChange={(e) => {
          setFilter(e.target.value);
          setActiveIndex(-1);
          if (eventId) onChange(""); // typing again invalidates the previous selection
        }}
        onKeyDown={handleKeyDown}
        placeholder="Search team or matchup…"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-activedescendant={open && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
      />
      {open && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border shadow-sm"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          {filtered.length === 0 ? (
            <li role="status" className="px-2 py-1.5 text-sm" style={{ color: "var(--muted)" }}>
              No matching games.
            </li>
          ) : (
            filtered.map((event, index) => (
              <li key={event.eventId}>
                <button
                  id={`${listboxId}-option-${index}`}
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  onClick={() => selectEvent(event)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className="block w-full px-2 py-1.5 text-left text-sm"
                  style={{ background: index === activeIndex ? "var(--border)" : undefined }}
                >
                  {formatMatchup(event)}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
      {selected && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="mt-0.5 text-xs underline"
          style={{ color: "var(--muted)" }}
        >
          Clear game
        </button>
      )}
      <button type="button" onClick={() => setManualMode(true)} className="mt-0.5 ml-3 text-xs underline" style={{ color: "var(--accent)" }}>
        Enter event id manually
      </button>
    </div>
  );
}
