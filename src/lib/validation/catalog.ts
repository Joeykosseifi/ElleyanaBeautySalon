import { z } from "zod";
import { checkbox, idSchema, moneyInput, optionalText, requiredText } from "./common";
import { EXPENSE_CATEGORIES } from "../domain/labels";
import { PAYMENT_METHODS } from "../domain/reports";

export const categoryInputSchema = z.object({
  name: requiredText("Category name", 40),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  active: checkbox,
});

export const serviceInputSchema = z.object({
  name: requiredText("Service name", 80),
  categoryId: idSchema.refine(Boolean, "Choose a category."),
  price: moneyInput("Price"),
  estimatedCost: moneyInput("Estimated cost").optional().default(0),
  durationMinutes: z
    .union([z.string(), z.number()])
    .nullish()
    .transform((v) => (v === "" || v == null ? null : Number(v)))
    .pipe(z.number().int("Duration must be whole minutes.").min(1, "Duration must be at least 1 minute.").max(1440).nullable()),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  active: checkbox,
  notes: optionalText(500),
});

export const employeeInputSchema = z
  .object({
    name: requiredText("Name", 80),
    phone: optionalText(30),
    role: optionalText(60),
    active: checkbox,
    commissionType: z.enum(["NONE", "PERCENTAGE", "FIXED"]).default("NONE"),
    /** Percent (e.g. "15") for PERCENTAGE, dollars for FIXED */
    commissionValue: z.union([z.string(), z.number()]).nullish(),
  })
  .transform((v, ctx) => {
    let commissionValue = 0;
    if (v.commissionType !== "NONE") {
      const n = Number(String(v.commissionValue ?? "").trim());
      if (!Number.isFinite(n) || n <= 0 || String(v.commissionValue ?? "").trim() === "") {
        ctx.addIssue({ code: "custom", message: "Enter a commission value greater than zero.", path: ["commissionValue"] });
        return z.NEVER;
      }
      if (v.commissionType === "PERCENTAGE" && n > 100) {
        ctx.addIssue({ code: "custom", message: "Commission cannot exceed 100%.", path: ["commissionValue"] });
        return z.NEVER;
      }
      commissionValue = Math.round(n * 100); // percent => basis points, dollars => cents
    }
    return { ...v, commissionValue };
  });

export const expenseInputSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES, { error: "Choose a category." }),
  description: requiredText("Description", 200),
  amount: moneyInput("Amount", { positive: true }),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date."),
  paymentMethod: z
    .union([z.enum(PAYMENT_METHODS), z.literal("")])
    .nullish()
    .transform((v) => (v ? v : null)),
  notes: optionalText(1000),
});

export const salonSettingsSchema = z.object({
  name: requiredText("Salon name", 80),
  timezone: z.string().trim().refine((tz) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Choose a valid time zone."),
});

export const profileSchema = z.object({
  name: requiredText("Name", 80),
});
