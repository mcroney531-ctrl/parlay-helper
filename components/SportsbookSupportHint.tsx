import { isRecognizedSportsbook } from "@/domain/sportsbook";
import { unsupportedBookText } from "@/domain/odds/refreshability";

/**
 * Shown as soon as a typed book isn't one the odds provider covers, before
 * the slip exists. Informational only: the slip can still be created and
 * built, it just won't get live prices.
 */
export function SportsbookSupportHint({ sportsbook }: { sportsbook: string }) {
  if (!sportsbook.trim() || isRecognizedSportsbook(sportsbook)) return null;
  return (
    <p className="text-xs font-medium" style={{ color: "var(--color-caution-fg)" }}>
      {unsupportedBookText(sportsbook)} You can still build this slip; estimates will use the odds you entered at
      capture.
    </p>
  );
}
