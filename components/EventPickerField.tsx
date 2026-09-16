"use client";

import { useEffect, useState } from "react";

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

  if (manualMode) {
    return (
      <div>
        <input
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
    return <p className="text-xs" style={{ color: "var(--muted)" }}>Select a league to look up games.</p>;
  }

  if (status === "loading") {
    return <p className="text-xs" style={{ color: "var(--muted)" }}>Loading games…</p>;
  }

  if (status === "unavailable") {
    return (
      <div>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
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
    <div className="relative">
      <input
        className={inputClass}
        style={inputStyle}
        value={selected ? formatMatchup(selected) : filter}
        onChange={(e) => {
          setFilter(e.target.value);
          if (eventId) onChange(""); // typing again invalidates the previous selection
        }}
        placeholder="Search team or matchup…"
      />
      {!selected && filter.trim().length > 0 && (
        <ul
          role="listbox"
          className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border shadow-sm"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          {filtered.length === 0 ? (
            <li className="px-2 py-1.5 text-sm" style={{ color: "var(--muted)" }}>
              No matching games.
            </li>
          ) : (
            filtered.map((event) => (
              <li key={event.eventId}>
                <button
                  type="button"
                  role="option"
                  aria-selected={event.eventId === eventId}
                  onClick={() => {
                    setFilter("");
                    onChange(event.eventId, { homeTeam: event.homeTeam, awayTeam: event.awayTeam });
                  }}
                  className="block w-full px-2 py-1.5 text-left text-sm hover:opacity-80"
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
