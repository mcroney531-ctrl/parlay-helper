import { describe, expect, it } from "vitest";
import { americanToDecimal, decimalToAmerican, roundAmerican } from "../conversion";

describe("americanToDecimal", () => {
  it("converts positive american odds", () => {
    expect(americanToDecimal(150)).toBeCloseTo(2.5);
    expect(americanToDecimal(4000)).toBeCloseTo(41);
  });

  it("converts negative american odds", () => {
    expect(americanToDecimal(-200)).toBeCloseTo(1.5);
    expect(americanToDecimal(-110)).toBeCloseTo(1.909, 3);
  });

  it("throws on zero", () => {
    expect(() => americanToDecimal(0)).toThrow();
  });
});

describe("decimalToAmerican", () => {
  it("converts decimal >= 2 to positive american", () => {
    expect(decimalToAmerican(2.5)).toBeCloseTo(150);
  });

  it("converts decimal < 2 to negative american", () => {
    expect(decimalToAmerican(1.5)).toBeCloseTo(-200);
  });

  it("throws on decimal <= 1", () => {
    expect(() => decimalToAmerican(1)).toThrow();
  });

  it("round-trips through americanToDecimal", () => {
    for (const american of [150, 4000, -110, -200, 250]) {
      const decimal = americanToDecimal(american);
      expect(decimalToAmerican(decimal)).toBeCloseTo(american, 0);
    }
  });
});

describe("roundAmerican", () => {
  it("keeps sign while rounding magnitude", () => {
    expect(roundAmerican(149.6)).toBe(150);
    expect(roundAmerican(-199.4)).toBe(-199);
  });
});
