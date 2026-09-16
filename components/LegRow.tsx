"use client";

import type { CapturedIdea, LiveContext } from "@/domain/types";
import { buildChangeRadar } from "@/domain/odds/changeRadar";

export function LegRow({
  idea,
  liveContext,
  onRemove,
}: {
  idea: CapturedIdea;
  liveContext: LiveContext | undefined;
  onRemove: () => void;
}) {
  const radar = buildChangeRadar(idea, liveContext);
  const summary = [idea.playerName, idea.team, idea.marketLabel, idea.selection, idea.lineAtCapture]
    .filter((v) => v !== null && v !== undefined && v !== "")
    .join(" · ");

  return (
    <li className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{summary || idea.rawText}</p>
          {!summary && (
            <span
              className="mt-1 inline-block rounded px-1.5 py-0.5 text-xs font-medium"
              style={{ background: "var(--warn-bg)", color: "var(--warn-foreground)" }}
            >
              Needs details
            </span>
          )}
        </div>
        <button type="button" onClick={onRemove} className="text-xs font-medium underline" style={{ color: "var(--muted)" }}>
          Remove
        </button>
      </div>
      <ul className="mt-1 flex flex-col gap-0.5">
        {radar.map((entry, i) => (
          <li
            key={i}
            className="text-xs"
            style={{
              color:
                entry.kind === "ok"
                  ? "var(--muted)"
                  : entry.kind === "stale" || entry.kind === "not_found"
                    ? "var(--warn-foreground)"
                    : "var(--foreground)",
            }}
          >
            {entry.text}
          </li>
        ))}
      </ul>
    </li>
  );
}
