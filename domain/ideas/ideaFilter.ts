import type { CapturedIdea } from "@/domain/types";
import { isIdeaPlaced, type IdeaUsage } from "@/domain/ideas/ideaUsage";

export type IdeaFilter = {
  search: string;
  /** "all" or a confidence level. */
  confidence: string;
  completion: "all" | "needs_details" | "structured";
  showArchived: boolean;
  /**
   * View-only (chunk 3 decision (h)): hides ideas that are a leg of any
   * History record, from the same usage result as the Placed badge. Nothing
   * is written, so there's nothing to undo.
   */
  hidePlaced: boolean;
};

/** The Ideas list as filtered on screen. */
export function filterIdeas(ideas: readonly CapturedIdea[], filter: IdeaFilter, usage: IdeaUsage): CapturedIdea[] {
  const query = filter.search.trim().toLowerCase();
  return ideas.filter((idea) => {
    if (Boolean(idea.archivedAt) !== filter.showArchived) return false;
    if (filter.hidePlaced && isIdeaPlaced(usage, idea.id)) return false;
    if (filter.confidence !== "all" && idea.confidence !== filter.confidence) return false;
    if (filter.completion !== "all" && idea.detailsStatus !== filter.completion) return false;
    if (query) {
      const haystack = [
        idea.rawText,
        idea.playerName,
        idea.team,
        idea.opponent,
        idea.marketLabel,
        idea.slateDate,
        idea.sportsbookAtCapture,
        idea.note,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}
