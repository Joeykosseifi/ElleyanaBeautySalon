import { describe, expect, it } from "vitest";
import {
  calculateAmountPaid,
  calculateClientBalance,
  calculateDiscount,
  calculateFinalTotal,
  calculatePaymentStatus,
  calculateProfit,
  calculateRemaining,
  calculateSaleTotals,
  calculateSubtotal,
  resolveCheckoutPayment,
  validateAdditionalPayment,
} from "../sale-calculations";
import { allocateProportionally, formatMoney, toCents } from "../money";

describe("subtotal & discounts", () => {
  it("sums price × quantity", () => {
    expect(
      calculateSubtotal([
        { unitPriceCents: 1000, quantity: 1 },
        { unitPriceCents: 1500, quantity: 2 },
      ]),
    ).toBe(4000);
  });

  it("applies a fixed discount", () => {
    expect(calculateDiscount(2500, { type: "FIXED", value: 500 })).toBe(500);
    expect(calculateSaleTotals([{ unitPriceCents: 2500, quantity: 1 }], { type: "FIXED", value: 500 })).toEqual({
      subtotalCents: 2500,
      discountCents: 500,
      finalTotalCents: 2000,
    });
  });

  it("applies a percentage discount (basis points) with cent rounding", () => {
    expect(calculateDiscount(2500, { type: "PERCENTAGE", value: 1000 })).toBe(250); // 10%
    expect(calculateDiscount(999, { type: "PERCENTAGE", value: 1250 })).toBe(125); // 12.5% of 9.99 = 1.24875
  });

  it("never discounts more than the subtotal or below zero", () => {
    expect(calculateDiscount(2000, { type: "FIXED", value: 5000 })).toBe(2000);
    expect(calculateDiscount(2000, { type: "PERCENTAGE", value: 20_000 })).toBe(2000);
    expect(calculateDiscount(2000, { type: "FIXED", value: -100 })).toBe(0);
    expect(calculateDiscount(2000, null)).toBe(0);
    expect(calculateFinalTotal(2000, 2500)).toBe(0);
  });
});

describe("payment status", () => {
  it("UNPAID when nothing paid", () => expect(calculatePaymentStatus(5000, 0)).toBe("UNPAID"));
  it("PARTIAL when some paid", () => expect(calculatePaymentStatus(3500, 2000)).toBe("PARTIAL"));
  it("PAID when fully paid", () => expect(calculatePaymentStatus(2500, 2500)).toBe("PAID"));
  it("PAID for a $0 sale", () => expect(calculatePaymentStatus(0, 0)).toBe("PAID"));

  it("transitions UNPAID → PARTIAL → PAID as payments are added", () => {
    const total = 5000;
    const payments: { amountCents: number }[] = [];
    expect(calculatePaymentStatus(total, calculateAmountPaid(payments))).toBe("UNPAID");
    payments.push({ amountCents: 3000 });
    expect(calculatePaymentStatus(total, calculateAmountPaid(payments))).toBe("PARTIAL");
    expect(calculateRemaining(total, calculateAmountPaid(payments))).toBe(2000);
    payments.push({ amountCents: 2000 });
    expect(calculatePaymentStatus(total, calculateAmountPaid(payments))).toBe("PAID");
    expect(calculateRemaining(total, calculateAmountPaid(payments))).toBe(0);
  });
});

describe("checkout payment resolution", () => {
  it("PAID records the full total", () => {
    expect(resolveCheckoutPayment(2500, "PAID", null)).toEqual({ ok: true, amountCents: 2500 });
  });
  it("UNPAID records nothing", () => {
    expect(resolveCheckoutPayment(5000, "UNPAID", 1234)).toEqual({ ok: true, amountCents: 0 });
  });
  it("PARTIAL requires 0 < amount < total", () => {
    expect(resolveCheckoutPayment(3500, "PARTIAL", 2000)).toEqual({ ok: true, amountCents: 2000 });
    expect(resolveCheckoutPayment(3500, "PARTIAL", 0).ok).toBe(false);
    expect(resolveCheckoutPayment(3500, "PARTIAL", -5).ok).toBe(false);
    expect(resolveCheckoutPayment(3500, "PARTIAL", 3500).ok).toBe(false);
    expect(resolveCheckoutPayment(3500, "PARTIAL", null).ok).toBe(false);
  });
});

describe("additional payments", () => {
  it("rejects negative, zero and overpayments", () => {
    expect(validateAdditionalPayment(5000, 0, -100).ok).toBe(false);
    expect(validateAdditionalPayment(5000, 0, 0).ok).toBe(false);
    expect(validateAdditionalPayment(5000, 3000, 2001).ok).toBe(false);
    expect(validateAdditionalPayment(5000, 5000, 100).ok).toBe(false);
    expect(validateAdditionalPayment(5000, 3000, 2000).ok).toBe(true);
  });
});

describe("client balance & profit", () => {
  it("sums what is still owed across sales", () => {
    expect(
      calculateClientBalance([
        { finalTotalCents: 2500, payments: [{ amountCents: 2500 }] },
        { finalTotalCents: 5000, payments: [{ amountCents: 2000 }] },
        { finalTotalCents: 1500, payments: [] },
      ]),
    ).toBe(4500);
  });

  it("computes cash profit and potential revenue", () => {
    expect(
      calculateProfit({
        collectedRevenueCents: 1_098_000,
        outstandingCents: 87_000,
        serviceCostsCents: 110_000,
        operatingExpensesCents: 410_000,
      }),
    ).toEqual({ estimatedCashProfitCents: 578_000, potentialRevenueCents: 1_185_000 });
  });
});

describe("money helpers", () => {
  it("parses user input to cents", () => {
    expect(toCents("12.5")).toBe(1250);
    expect(toCents("$1,200")).toBe(120000);
    expect(toCents("0.1")).toBe(10);
    expect(Number.isNaN(toCents("abc"))).toBe(true);
    expect(Number.isNaN(toCents("1.234"))).toBe(true);
  });
  it("formats cents", () => {
    expect(formatMoney(2500)).toBe("$25");
    expect(formatMoney(1250)).toBe("$12.50");
    expect(formatMoney(540000)).toBe("$5,400");
  });
  it("allocates proportionally without losing cents", () => {
    const parts = allocateProportionally(1000, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(parts).toEqual([334, 333, 333]);
    expect(allocateProportionally(2000, [1000, 1500])).toEqual([800, 1200]);
  });
});
