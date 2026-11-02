import { describe, expect, it } from "vitest";
import { detectConcentrationSignals } from "../concentration";

function leg(ideaId: string, eventId: string | null, team: string | null, kickoffWindow: string | null, league: string | null = null) {
  return { ideaId, eventId, team, kickoffWindow, league };
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
    const teamSignal = signals.find((s) => s.dimension === "team" && s.value === "Baltimore Ravens");
    expect(teamSignal).toBeDefined();
    expect(teamSignal?.shareRatio).toBeCloseTo(0.75);
  });

  it("never puts another league's team with an NFL one: NFL Jets plus two NHL Jets is 2 of 4, not 3 (B's review of 1c3c2e0)", () => {
    const signals = detectConcentrationSignals([
      leg("1", "evt-a", "New York Jets", "sun-1pm", "NFL"),
      leg("2", "evt-b", "Jets", "sat-7pm", "NHL"),
      leg("3", "evt-c", "Jets", "tue-7pm", "NHL"),
      leg("4", "evt-d", "SF", "thu-8pm", "NFL"),
    ]);
    const team = signals.filter((s) => s.dimension === "team");
    expect(team).toHaveLength(1);
    expect(team[0]).toMatchObject({ value: "Jets", ideaIds: ["2", "3"] });
    expect(team[0].explanation).toBe("2 of 4 legs (50%) share the same team.");
  });

  it("counts a team once however it's stored: an older idea's code and a full name (chunk 4b)", () => {
    const signals = detectConcentrationSignals([
      leg("1", "evt-a", "LAR", "sun-1pm"),
      leg("2", "evt-b", "Los Angeles Rams", "sun-4pm"),
      leg("3", "evt-c", "KC", "mon-8pm"),
      leg("4", "evt-d", "SF", "thu-8pm"),
    ]);
    expect(signals.find((s) => s.dimension === "team")).toMatchObject({ value: "Los Angeles Rams", ideaIds: ["1", "2"] });
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
