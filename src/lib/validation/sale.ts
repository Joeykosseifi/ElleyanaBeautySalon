import { z } from "zod";
import { centsSchema, idSchema, MAX_MONEY_CENTS, optionalText, paymentMethodSchema } from "./common";
import { clientInputSchema } from "./client";

export const discountSchema = z
  .object({
    type: z.enum(["FIXED", "PERCENTAGE"]),
    /** FIXED => cents, PERCENTAGE => basis points */
    value: z.number().int().min(0, "Discount cannot be negative."),
  })
  .refine((d) => d.type !== "PERCENTAGE" || d.value <= 10_000, {
    message: "Percentage discount cannot exceed 100%.",
    path: ["value"],
  });

const quantitySchema = z.number().int("Quantity must be a whole number.").min(1, "Quantity must be at least 1.").max(50, "Quantity is too large.");
/** $0 is allowed on purpose: complimentary services still count as performed. */
const chargedPriceSchema = z
  .number({ error: "Enter the price charged." })
  .int("Price must be in whole cents.")
  .min(0, "Price cannot be negative.")
  .max(MAX_MONEY_CENTS, "Price is too large.");

/** A service from the catalog. `unitPriceCents` overrides the catalog price for this sale only. */
export const catalogItemSchema = z.object({
  kind: z.literal("catalog").optional(),
  serviceId: idSchema,
  quantity: quantitySchema,
  unitPriceCents: chargedPriceSchema.nullish(),
});

/** A one-off service typed in at checkout. Never added to the catalog. */
export const customItemSchema = z.object({
  kind: z.literal("custom"),
  name: z.string({ error: "Enter the service name." }).trim().min(1, "Enter the service name.").max(80, "Service name is too long."),
  quantity: quantitySchema,
  unitPriceCents: chargedPriceSchema,
  estimatedCostCents: z.number().int().min(0, "Estimated cost cannot be negative.").max(MAX_MONEY_CENTS).nullish(),
});

export const saleItemSchema = z.union([customItemSchema, catalogItemSchema]);

export const createSaleSchema = z
  .object({
    clientId: idSchema.nullish(),
    /** Create a client on the fly instead of selecting one */
    newClient: clientInputSchema.nullish(),
    employeeId: idSchema.nullish(),
    items: z.array(saleItemSchema).min(1, "Select at least one service.").max(50, "Too many services on one sale."),
    discount: discountSchema.nullish(),
    paymentStatus: z.enum(["PAID", "PARTIAL", "UNPAID"], { error: "Choose a payment status." }),
    /** Only used for PARTIAL. PAID always records the full total; UNPAID records nothing. */
    amountPaidCents: centsSchema.nullish(),
    paymentMethod: paymentMethodSchema.nullish(),
    notes: optionalText(1000),
    /** One key per Complete Sale attempt; a retry with the same key never creates a second sale. */
    idempotencyKey: z
      .string()
      .trim()
      .min(8)
      .max(100)
      .regex(/^[A-Za-z0-9_-]+$/, "Invalid request key.")
      .nullish(),
  })
  .refine((v) => !(v.clientId && v.newClient), { message: "Choose an existing client or a new one, not both." });

export type CreateSaleInput = z.input<typeof createSaleSchema>;

export const addPaymentSchema = z.object({
  saleId: idSchema,
  amountCents: z.number().int().min(1, "Payment amount must be greater than zero.").max(100_000_000),
  method: paymentMethodSchema,
  notes: optionalText(500),
});

export type AddPaymentInput = z.input<typeof addPaymentSchema>;

export const voidSaleSchema = z.object({
  saleId: idSchema,
  reason: optionalText(300),
});

export type VoidSaleInput = z.input<typeof voidSaleSchema>;

export const salesFilterSchema = z.object({
  q: z.string().trim().max(100).optional().default(""),
  status: z.enum(["PAID", "PARTIAL", "UNPAID", "OUTSTANDING", "VOIDED"]).optional(),
});
