import type { Confidence } from "@/domain/types";

const LABEL: Record<Confidence, string> = {
  core: "Core",
  like: "Like",
  longshot: "Longshot",
  unrated: "Unrated",
};

const VAR: Record<Confidence, string> = {
  core: "--core",
  like: "--like",
  longshot: "--longshot",
  unrated: "--unrated",
};

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium"
      style={{ borderColor: `var(${VAR[confidence]})`, color: `var(${VAR[confidence]})` }}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ background: `var(${VAR[confidence]})` }} />
      {LABEL[confidence]}
    </span>
  );
}
