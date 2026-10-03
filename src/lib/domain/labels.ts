import type { PaymentMethod } from "./reports";
import type { PaymentStatus } from "./sale-calculations";

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Cash",
  CARD: "Card",
  BANK_TRANSFER: "Bank Transfer",
  WHISH: "Whish",
  OMT: "OMT",
  OTHER: "Other",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PAID: "Paid",
  PARTIAL: "Partially Paid",
  UNPAID: "Unpaid",
};

export const EXPENSE_CATEGORIES = [
  "RENT",
  "PRODUCTS",
  "ELECTRICITY",
  "SALARIES",
  "MARKETING",
  "MAINTENANCE",
  "OTHER",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  RENT: "Rent",
  PRODUCTS: "Products",
  ELECTRICITY: "Electricity",
  SALARIES: "Salaries",
  MARKETING: "Marketing",
  MAINTENANCE: "Maintenance",
  OTHER: "Other",
};

export const COMMISSION_TYPE_LABELS = {
  NONE: "No commission",
  PERCENTAGE: "Percentage of service value",
  FIXED: "Fixed amount per service",
} as const;

export function clientDisplayName(client: { firstName: string; lastName?: string | null } | null | undefined): string {
  if (!client) return "Walk-in Client";
  return [client.firstName, client.lastName].filter(Boolean).join(" ");
}
