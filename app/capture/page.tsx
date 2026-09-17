"use client";

import Link from "next/link";
import { QuickAddForm } from "@/components/QuickAddForm";
import { IdeaCard } from "@/components/IdeaCard";
import { PageShell } from "@/components/PageShell";
import { CaptureIcon } from "@/components/icons";
import { useData } from "@/app/DataProvider";

export default function CapturePage() {
  const { ideas, loading } = useData();
  const recent = ideas.filter((idea) => !idea.archivedAt).slice(0, 5);

  return (
    <PageShell title="CAPTURE" icon={<CaptureIcon className="h-8 w-8" />}>
      <div className="flex flex-col gap-8">
        <section>
          <QuickAddForm />
        </section>

        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-display text-lg" style={{ color: "var(--color-ink)" }}>
              Recently Captured
            </h2>
            <Link href="/bucket" className="text-sm font-semibold" style={{ color: "var(--color-action)" }}>
              View bucket →
            </Link>
          </div>
          {loading ? (
            <p className="text-sm" style={{ color: "var(--color-muted)" }}>
              Loading…
            </p>
          ) : recent.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--color-muted)" }}>
              Nothing captured yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {recent.map((idea) => (
                <IdeaCard key={idea.id} idea={idea} variant="compact" />
              ))}
            </ul>
          )}
        </section>
      </div>
    </PageShell>
  );
}
