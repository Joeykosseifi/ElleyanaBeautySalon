/**
 * Core sale & payment calculations.
 *
 * These pure functions are the single source of truth for money math. They are used
 * by the Quick Add Sale screen (for instant feedback) AND by the server (which never
 * trusts totals sent from the browser and recomputes everything before saving).
 */

export type DiscountType = "FIXED" | "PERCENTAGE";
export type PaymentStatus = "PAID" | "PARTIAL" | "UNPAID";

export interface LineInput {
  unitPriceCents: number;
  quantity: number;
}

export interface DiscountInput {
  type: DiscountType | null | undefined;
  /** FIXED => cents. PERCENTAGE => basis points (1000 = 10%). */
  value: number;
}

export interface PaymentLike {
  amountCents: number;
}

export function calculateLineTotal(unitPriceCents: number, quantity: number): number {
  return unitPriceCents * quantity;
}

/** Sum of all sale lines (price × quantity). */
export function calculateSubtotal(lines: LineInput[]): number {
  return lines.reduce((sum, l) => sum + calculateLineTotal(l.unitPriceCents, l.quantity), 0);
}

/**
 * Discount amount in cents. Never negative and never more than the subtotal.
 * Percentages are rounded to the nearest cent.
 */
export function calculateDiscount(subtotalCents: number, discount?: DiscountInput | null): number {
  if (!discount || !discount.type || discount.value <= 0 || subtotalCents <= 0) return 0;
  const raw =
    discount.type === "PERCENTAGE"
      ? Math.round((subtotalCents * Math.min(discount.value, 10_000)) / 10_000)
      : discount.value;
  return Math.max(0, Math.min(raw, subtotalCents));
}

export function calculateFinalTotal(subtotalCents: number, discountCents: number): number {
  return Math.max(0, subtotalCents - discountCents);
}

export function calculateAmountPaid(payments: PaymentLike[]): number {
  return payments.reduce((sum, p) => sum + p.amountCents, 0);
}

/** What the client still owes on a sale. Never negative. */
export function calculateRemaining(finalTotalCents: number, amountPaidCents: number): number {
  return Math.max(0, finalTotalCents - amountPaidCents);
}

/**
 * Payment status is always derived from money, never trusted from user input.
 * A $0 sale (e.g. a 100% discount) is considered PAID — nothing is owed.
 */
export function calculatePaymentStatus(finalTotalCents: number, amountPaidCents: number): PaymentStatus {
  if (amountPaidCents >= finalTotalCents) return "PAID";
  if (amountPaidCents <= 0) return "UNPAID";
  return "PARTIAL";
}

export interface SaleTotals {
  subtotalCents: number;
  discountCents: number;
  finalTotalCents: number;
}

export function calculateSaleTotals(lines: LineInput[], discount?: DiscountInput | null): SaleTotals {
  const subtotalCents = calculateSubtotal(lines);
  const discountCents = calculateDiscount(subtotalCents, discount);
  return { subtotalCents, discountCents, finalTotalCents: calculateFinalTotal(subtotalCents, discountCents) };
}

/**
 * The amount that should be recorded at checkout for the selected payment status.
 * Returns an error message when the combination is invalid.
 */
export function resolveCheckoutPayment(
  finalTotalCents: number,
  status: PaymentStatus,
  enteredAmountCents: number | null | undefined,
): { ok: true; amountCents: number } | { ok: false; error: string } {
  if (status === "PAID") return { ok: true, amountCents: finalTotalCents };
  if (status === "UNPAID") return { ok: true, amountCents: 0 };
  // PARTIAL
  if (finalTotalCents <= 0) return { ok: false, error: "This sale has no amount to pay partially." };
  if (enteredAmountCents == null || Number.isNaN(enteredAmountCents) || enteredAmountCents <= 0) {
    return { ok: false, error: "Enter the amount the client paid." };
  }
  if (enteredAmountCents >= finalTotalCents) {
    return { ok: false, error: "A partial payment must be less than the total. Choose Paid instead." };
  }
  return { ok: true, amountCents: enteredAmountCents };
}

/**
 * Validate a later payment against an existing sale. Overpayment is not supported:
 * a payment can never exceed what is still owed.
 */
export function validateAdditionalPayment(
  finalTotalCents: number,
  amountPaidCents: number,
  newPaymentCents: number,
): { ok: true } | { ok: false; error: string } {
  if (!Number.isInteger(newPaymentCents) || newPaymentCents <= 0) {
    return { ok: false, error: "Payment amount must be greater than zero." };
  }
  const remaining = calculateRemaining(finalTotalCents, amountPaidCents);
  if (remaining <= 0) return { ok: false, error: "This sale is already fully paid." };
  if (newPaymentCents > remaining) {
    return { ok: false, error: "Payment is more than the remaining balance." };
  }
  return { ok: true };
}

export interface BalanceSale {
  finalTotalCents: number;
  payments: PaymentLike[];
}

/** A client's outstanding balance = Σ (sale total − payments) across their sales. */
export function calculateClientBalance(sales: BalanceSale[]): number {
  return sales.reduce(
    (sum, s) => sum + calculateRemaining(s.finalTotalCents, calculateAmountPaid(s.payments)),
    0,
  );
}

export interface ProfitInput {
  collectedRevenueCents: number;
  outstandingCents: number;
  serviceCostsCents: number;
  operatingExpensesCents: number;
}

export interface ProfitResult {
  /** Collected Revenue − Service Costs − Operating Expenses */
  estimatedCashProfitCents: number;
  /** Collected Revenue + Outstanding */
  potentialRevenueCents: number;
}

export function calculateProfit(input: ProfitInput): ProfitResult {
  return {
    estimatedCashProfitCents:
      input.collectedRevenueCents - input.serviceCostsCents - input.operatingExpensesCents,
    potentialRevenueCents: input.collectedRevenueCents + input.outstandingCents,
  };
}
