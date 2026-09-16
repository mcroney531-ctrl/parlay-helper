"use client";

import Link from "next/link";
import { QuickAddForm } from "@/components/QuickAddForm";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { useData } from "@/app/DataProvider";

export default function CapturePage() {
  const { ideas, loading } = useData();
  const recent = ideas.slice(0, 5);

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="mb-4 text-xl font-semibold">Quick Add</h1>
        <QuickAddForm />
      </section>

      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold" style={{ color: "var(--muted)" }}>
            Recently captured
          </h2>
          <Link href="/bucket" className="text-sm font-medium" style={{ color: "var(--accent)" }}>
            View bucket →
          </Link>
        </div>
        {loading ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Loading…
          </p>
        ) : recent.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Nothing captured yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {recent.map((idea) => (
              <li
                key={idea.id}
                className="rounded-lg border p-3"
                style={{ borderColor: "var(--border)", background: "var(--surface)" }}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm">{idea.rawText}</p>
                  <ConfidenceBadge confidence={idea.confidence} />
                </div>
                {idea.detailsStatus === "needs_details" && (
                  <span
                    className="mt-1 inline-block rounded px-1.5 py-0.5 text-xs font-medium"
                    style={{ background: "var(--warn-bg)", color: "var(--warn-foreground)" }}
                  >
                    Needs details
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
