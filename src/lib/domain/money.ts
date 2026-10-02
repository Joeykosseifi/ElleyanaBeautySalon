/**
 * Money helpers. All amounts are integer cents throughout the app.
 */

/** Convert a user-entered amount ("12.5", 12.5) to integer cents. Returns NaN when invalid. */
export function toCents(value: string | number): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.round(value * 100) : NaN;
  }
  const cleaned = value.replace(/[,\s$]/g, "");
  if (cleaned === "" || !/^-?\d*(\.\d{0,2})?$/.test(cleaned)) return NaN;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

/** Cents => plain decimal string for inputs ("12.5" => "12.50", 1000 => "10"). */
export function centsToInput(cents: number): string {
  if (cents % 100 === 0) return String(cents / 100);
  return (cents / 100).toFixed(2);
}

export function formatMoney(cents: number, currency = "USD"): string {
  const hasFraction = cents % 100 !== 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/** Basis points (1000) => "10%" */
export function formatPercent(bps: number): string {
  const pct = bps / 100;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(2)}%`;
}

/**
 * Split `total` across `weights` proportionally, in whole cents, so that the parts
 * always sum exactly to `total` (largest remainder method).
 */
export function allocateProportionally(total: number, weights: number[]): number[] {
  const weightSum = weights.reduce((a, b) => a + b, 0);
  if (weights.length === 0) return [];
  if (weightSum <= 0) {
    // Nothing to weigh by — put everything on the first part.
    return weights.map((_, i) => (i === 0 ? total : 0));
  }
  const raw = weights.map((w) => (total * w) / weightSum);
  const floored = raw.map((r) => Math.floor(r));
  let leftover = total - floored.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (leftover <= 0) break;
    floored[i] += 1;
    leftover -= 1;
  }
  return floored;
}
