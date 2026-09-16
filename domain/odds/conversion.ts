// American <-> decimal odds conversion. Pure math, no business rules.

export function americanToDecimal(american: number): number {
  if (american === 0) {
    throw new Error("American odds cannot be 0");
  }
  return american > 0 ? 1 + american / 100 : 1 + 100 / Math.abs(american);
}

export function decimalToAmerican(decimal: number): number {
  if (decimal <= 1) {
    throw new Error("Decimal odds must be greater than 1");
  }
  return decimal >= 2 ? (decimal - 1) * 100 : -100 / (decimal - 1);
}

export function roundAmerican(american: number): number {
  return american > 0 ? Math.round(american) : -Math.round(Math.abs(american));
}

/** American odds are never quoted between -99 and 99 (exclusive) or as 0/NaN. */
export function isValidAmericanOdds(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value) >= 100;
}
