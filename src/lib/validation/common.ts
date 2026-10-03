import { z } from "zod";
import { toCents } from "../domain/money";
import { PAYMENT_METHODS } from "../domain/reports";

export const MAX_MONEY_CENTS = 100_000_000; // $1,000,000 — guards against typos

export const idSchema = z.string().trim().min(1).max(64);

/** Optional trimmed text: "" => null */
export const optionalText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max, `Must be ${max} characters or fewer.`)
    .nullish()
    .transform((v) => (v ? v : null));

export const requiredText = (label: string, max = 120) =>
  z.string({ error: `${label} is required.` }).trim().min(1, `${label} is required.`).max(max, `${label} is too long.`);

/** Integer cents (from JSON) */
export const centsSchema = z
  .number({ error: "Enter an amount." })
  .int("Amount must be in whole cents.")
  .min(0, "Amount cannot be negative.")
  .max(MAX_MONEY_CENTS, "Amount is too large.");

/** A dollar amount typed into a form ("12.50") => cents */
export const moneyInput = (label: string, opts: { positive?: boolean } = {}) =>
  z
    .union([z.string(), z.number()], { error: `${label} is required.` })
    .transform((v, ctx) => {
      const cents = toCents(v);
      if (Number.isNaN(cents)) {
        ctx.addIssue({ code: "custom", message: `${label} must be a valid amount.` });
        return z.NEVER;
      }
      return cents;
    })
    .pipe(
      z
        .number()
        .min(opts.positive ? 1 : 0, opts.positive ? `${label} must be greater than zero.` : `${label} cannot be negative.`)
        .max(MAX_MONEY_CENTS, `${label} is too large.`),
    );

export const paymentMethodSchema = z.enum(PAYMENT_METHODS, { error: "Choose a payment method." });

export const phoneSchema = z
  .string()
  .trim()
  .max(30, "Phone number is too long.")
  .regex(/^[+()\d\s-]*$/, "Phone number can only contain digits, spaces, +, - and ().")
  .nullish()
  .transform((v) => (v ? v : null));

export const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(200)
  .nullish()
  .transform((v) => (v ? v : null))
  .pipe(z.email("Enter a valid email address.").nullable());

/** "on" / "true" / true => true */
export const checkbox = z
  .union([z.boolean(), z.string()])
  .nullish()
  .transform((v) => v === true || v === "on" || v === "true");
