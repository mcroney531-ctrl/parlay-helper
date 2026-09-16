import { describe, expect, it } from "vitest";
import { detectCorrelationSignals } from "../correlation";

describe("detectCorrelationSignals", () => {
  it("triggers when two legs share an event", () => {
    const signals = detectCorrelationSignals([
      { ideaId: "1", eventId: "evt-a" },
      { ideaId: "2", eventId: "evt-a" },
      { ideaId: "3", eventId: "evt-b" },
    ]);
    expect(signals).toHaveLength(1);
    expect(signals[0].eventId).toBe("evt-a");
    expect(signals[0].ideaIds).toEqual(["1", "2"]);
  });

  it("does not trigger for a single leg per event", () => {
    const signals = detectCorrelationSignals([
      { ideaId: "1", eventId: "evt-a" },
      { ideaId: "2", eventId: "evt-b" },
    ]);
    expect(signals).toHaveLength(0);
  });

  it("never labels the correlation as positive or negative", () => {
    const signals = detectCorrelationSignals([
      { ideaId: "1", eventId: "evt-a" },
      { ideaId: "2", eventId: "evt-a" },
    ]);
    expect(signals[0].explanation.toLowerCase()).not.toMatch(/positive|negative|good|bad/);
  });
});
