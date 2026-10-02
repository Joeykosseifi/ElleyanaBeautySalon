import { z } from "zod";
import { centsSchema, idSchema, optionalText, paymentMethodSchema } from "./common";
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

export const createSaleSchema = z
  .object({
    clientId: idSchema.nullish(),
    /** Create a client on the fly instead of selecting one */
    newClient: clientInputSchema.nullish(),
    employeeId: idSchema.nullish(),
    items: z
      .array(z.object({ serviceId: idSchema, quantity: z.number().int().min(1).max(50) }))
      .min(1, "Select at least one service.")
      .max(50),
    discount: discountSchema.nullish(),
    paymentStatus: z.enum(["PAID", "PARTIAL", "UNPAID"], { error: "Choose a payment status." }),
    /** Only used for PARTIAL. PAID always records the full total; UNPAID records nothing. */
    amountPaidCents: centsSchema.nullish(),
    paymentMethod: paymentMethodSchema.nullish(),
    notes: optionalText(1000),
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

export const salesFilterSchema = z.object({
  q: z.string().trim().max(100).optional().default(""),
  status: z.enum(["PAID", "PARTIAL", "UNPAID", "OUTSTANDING"]).optional(),
});
