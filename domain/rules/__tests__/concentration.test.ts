import { describe, expect, it } from "vitest";
import { detectConcentrationSignals } from "../concentration";

function leg(ideaId: string, eventId: string | null, team: string | null, kickoffWindow: string | null) {
  return { ideaId, eventId, team, kickoffWindow };
}

describe("detectConcentrationSignals", () => {
  it("does not evaluate below 4 legs", () => {
    const signals = detectConcentrationSignals([
      leg("1", "evt-a", "BAL", "sun-1pm"),
      leg("2", "evt-a", "BAL", "sun-1pm"),
      leg("3", "evt-a", "BAL", "sun-1pm"),
    ]);
    expect(signals).toHaveLength(0);
  });

  it("triggers at 4+ legs when 50%+ share an event", () => {
    const signals = detectConcentrationSignals([
      leg("1", "evt-a", "BAL", "sun-1pm"),
      leg("2", "evt-a", "CIN", "sun-1pm"),
      leg("3", "evt-b", "KC", "sun-4pm"),
      leg("4", "evt-c", "SF", "sun-4pm"),
    ]);
    const eventSignal = signals.find((s) => s.dimension === "event");
    expect(eventSignal).toBeDefined();
    expect(eventSignal?.shareRatio).toBeCloseTo(0.5);
  });

  it("triggers on team concentration", () => {
    const signals = detectConcentrationSignals([
      leg("1", "evt-a", "BAL", "sun-1pm"),
      leg("2", "evt-a", "BAL", "sun-1pm"),
      leg("3", "evt-a", "BAL", "sun-1pm"),
      leg("4", "evt-b", "KC", "sun-4pm"),
    ]);
    const teamSignal = signals.find((s) => s.dimension === "team" && s.value === "BAL");
    expect(teamSignal).toBeDefined();
    expect(teamSignal?.shareRatio).toBeCloseTo(0.75);
  });

  it("does not trigger below the 50% threshold", () => {
    const signals = detectConcentrationSignals([
      leg("1", "evt-a", "BAL", "sun-1pm"),
      leg("2", "evt-b", "CIN", "sun-4pm"),
      leg("3", "evt-c", "KC", "mon-8pm"),
      leg("4", "evt-d", "SF", "thu-8pm"),
    ]);
    expect(signals).toHaveLength(0);
  });
});
