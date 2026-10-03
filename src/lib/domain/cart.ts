/**
 * The Quick Add Sale "cart": pure, immutable helpers for the lines being built
 * before a sale is completed. Kept free of React so the behaviour (price
 * overrides, custom services, removing lines) is unit tested.
 */
import type { LineInput } from "./sale-calculations";

export const MAX_LINE_QUANTITY = 50;

export interface CatalogLine {
  kind: "catalog";
  key: string;
  serviceId: string;
  name: string;
  /** Catalog price — shown as "Standard price". */
  standardPriceCents: number;
  /** What this client is charged per unit. Defaults to the standard price. */
  unitPriceCents: number;
  quantity: number;
}

export interface CustomLine {
  kind: "custom";
  key: string;
  name: string;
  unitPriceCents: number;
  estimatedCostCents: number;
  quantity: number;
}

export type CartLine = CatalogLine | CustomLine;

export interface CatalogServiceRef {
  id: string;
  name: string;
  priceCents: number;
}

export interface CustomServiceDraft {
  name: string;
  unitPriceCents: number;
  estimatedCostCents?: number;
  quantity?: number;
}

/** Item payload the server expects (see createSaleSchema). */
export type SaleItemPayload =
  | { kind: "catalog"; serviceId: string; quantity: number; unitPriceCents: number }
  | { kind: "custom"; name: string; quantity: number; unitPriceCents: number; estimatedCostCents: number };

let keySeq = 0;
const nextKey = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(keySeq++).toString(36)}`;

const clampQty = (q: number) => Math.max(1, Math.min(MAX_LINE_QUANTITY, Math.round(q)));

export function catalogQuantity(lines: CartLine[], serviceId: string): number {
  return lines.reduce((n, l) => n + (l.kind === "catalog" && l.serviceId === serviceId ? l.quantity : 0), 0);
}

/** Tapping a service card adds it at its catalog price, or removes it if already added. */
export function toggleCatalogService(lines: CartLine[], service: CatalogServiceRef): CartLine[] {
  if (lines.some((l) => l.kind === "catalog" && l.serviceId === service.id)) {
    return lines.filter((l) => !(l.kind === "catalog" && l.serviceId === service.id));
  }
  return [
    ...lines,
    {
      kind: "catalog",
      key: nextKey("svc"),
      serviceId: service.id,
      name: service.name,
      standardPriceCents: service.priceCents,
      unitPriceCents: service.priceCents,
      quantity: 1,
    },
  ];
}

export function validateCustomService(draft: { name: string; unitPriceCents: number | null; estimatedCostCents?: number | null; quantity?: number | null }):
  | { ok: true }
  | { ok: false; errors: Partial<Record<"name" | "price" | "cost" | "quantity", string>> } {
  const errors: Partial<Record<"name" | "price" | "cost" | "quantity", string>> = {};
  if (!draft.name.trim()) errors.name = "Enter the service name.";
  else if (draft.name.trim().length > 80) errors.name = "Name is too long.";
  if (draft.unitPriceCents == null || Number.isNaN(draft.unitPriceCents)) errors.price = "Enter the price charged.";
  else if (draft.unitPriceCents < 0) errors.price = "Price cannot be negative.";
  if (draft.estimatedCostCents != null && (Number.isNaN(draft.estimatedCostCents) || draft.estimatedCostCents < 0)) {
    errors.cost = "Cost must be zero or more.";
  }
  if (draft.quantity != null && (!Number.isInteger(draft.quantity) || draft.quantity < 1 || draft.quantity > MAX_LINE_QUANTITY)) {
    errors.quantity = `Quantity must be between 1 and ${MAX_LINE_QUANTITY}.`;
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true };
}

export function addCustomService(lines: CartLine[], draft: CustomServiceDraft): CartLine[] {
  return [
    ...lines,
    {
      kind: "custom",
      key: nextKey("custom"),
      name: draft.name.trim(),
      unitPriceCents: draft.unitPriceCents,
      estimatedCostCents: draft.estimatedCostCents ?? 0,
      quantity: clampQty(draft.quantity ?? 1),
    },
  ];
}

export function updateCustomService(lines: CartLine[], key: string, draft: CustomServiceDraft): CartLine[] {
  return lines.map((l) =>
    l.key === key && l.kind === "custom"
      ? {
          ...l,
          name: draft.name.trim(),
          unitPriceCents: draft.unitPriceCents,
          estimatedCostCents: draft.estimatedCostCents ?? 0,
          quantity: clampQty(draft.quantity ?? l.quantity),
        }
      : l,
  );
}

/** Change the price charged for one line only. Never touches the catalog. */
export function setLinePrice(lines: CartLine[], key: string, unitPriceCents: number): CartLine[] {
  if (!Number.isInteger(unitPriceCents) || unitPriceCents < 0) return lines;
  return lines.map((l) => (l.key === key ? { ...l, unitPriceCents } : l));
}

export function resetLinePrice(lines: CartLine[], key: string): CartLine[] {
  return lines.map((l) => (l.key === key && l.kind === "catalog" ? { ...l, unitPriceCents: l.standardPriceCents } : l));
}

export function setLineQuantity(lines: CartLine[], key: string, quantity: number): CartLine[] {
  return lines.map((l) => (l.key === key ? { ...l, quantity: clampQty(quantity) } : l));
}

export function removeLine(lines: CartLine[], key: string): CartLine[] {
  return lines.filter((l) => l.key !== key);
}

export function isPriceOverridden(line: CartLine): boolean {
  return line.kind === "catalog" && line.unitPriceCents !== line.standardPriceCents;
}

export function cartToLineInputs(lines: CartLine[]): LineInput[] {
  return lines.map((l) => ({ unitPriceCents: l.unitPriceCents, quantity: l.quantity }));
}

export function cartToSaleItems(lines: CartLine[]): SaleItemPayload[] {
  return lines.map((l) =>
    l.kind === "catalog"
      ? { kind: "catalog", serviceId: l.serviceId, quantity: l.quantity, unitPriceCents: l.unitPriceCents }
      : { kind: "custom", name: l.name, quantity: l.quantity, unitPriceCents: l.unitPriceCents, estimatedCostCents: l.estimatedCostCents },
  );
}
