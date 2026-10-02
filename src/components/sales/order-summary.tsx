"use client";

import { Minus, Plus, Tag, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/domain/money";
import type { SaleTotals } from "@/lib/domain/sale-calculations";
import type { QuickService } from "./types";

export interface OrderLine {
  service: QuickService;
  quantity: number;
}

export interface DiscountDraft {
  open: boolean;
  type: "FIXED" | "PERCENTAGE";
  input: string;
}

export function OrderSummary({
  lines,
  totals,
  discount,
  onDiscountChange,
  onQuantity,
  onRemove,
  discountInvalid,
}: {
  lines: OrderLine[];
  totals: SaleTotals;
  discount: DiscountDraft;
  onDiscountChange: (d: DiscountDraft) => void;
  onQuantity: (serviceId: string, qty: number) => void;
  onRemove: (serviceId: string) => void;
  discountInvalid?: boolean;
}) {
  if (lines.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-sand bg-cream/40 px-4 py-6 text-center text-sm text-muted">
        No services selected yet.
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-cream/60 p-3 sm:p-4">
      <ul className="divide-y divide-beige/70">
        {lines.map((l) => (
          <li key={l.service.id} className="flex items-center gap-2 py-2.5 first:pt-0.5">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-ink">{l.service.name}</p>
              <p className="text-xs text-muted tabular">
                {formatMoney(l.service.priceCents)}
                {l.quantity > 1 ? ` × ${l.quantity}` : ""}
              </p>
            </div>
            <div className="flex items-center rounded-full border border-beige bg-white">
              <button
                type="button"
                onClick={() => (l.quantity > 1 ? onQuantity(l.service.id, l.quantity - 1) : onRemove(l.service.id))}
                className="flex size-9 items-center justify-center rounded-full text-ink-soft hover:bg-cream"
                aria-label={`Decrease ${l.service.name}`}
              >
                <Minus className="size-4" />
              </button>
              <span className="w-6 text-center text-sm font-semibold tabular" aria-label="Quantity">
                {l.quantity}
              </span>
              <button
                type="button"
                onClick={() => onQuantity(l.service.id, Math.min(l.quantity + 1, 50))}
                className="flex size-9 items-center justify-center rounded-full text-ink-soft hover:bg-cream"
                aria-label={`Increase ${l.service.name}`}
              >
                <Plus className="size-4" />
              </button>
            </div>
            <span className="w-16 text-right font-semibold tabular">{formatMoney(l.service.priceCents * l.quantity)}</span>
            <button
              type="button"
              onClick={() => onRemove(l.service.id)}
              className="flex size-9 items-center justify-center rounded-full text-muted hover:bg-unpaid-bg hover:text-unpaid"
              aria-label={`Remove ${l.service.name}`}
            >
              <Trash2 className="size-4" />
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-2 space-y-2 border-t border-beige/70 pt-3 text-sm">
        <Row label="Subtotal" value={formatMoney(totals.subtotalCents)} />

        {discount.open ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex-1 text-ink-soft">Discount</span>
            <div className="flex rounded-lg border border-beige bg-white p-0.5" role="radiogroup" aria-label="Discount type">
              {(["FIXED", "PERCENTAGE"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={discount.type === t}
                  onClick={() => onDiscountChange({ ...discount, type: t })}
                  className={cn(
                    "h-8 w-9 rounded-md text-sm font-semibold",
                    discount.type === t ? "bg-rose text-white" : "text-ink-soft",
                  )}
                >
                  {t === "FIXED" ? "$" : "%"}
                </button>
              ))}
            </div>
            <input
              autoFocus
              inputMode="decimal"
              value={discount.input}
              onChange={(e) => onDiscountChange({ ...discount, input: e.target.value })}
              placeholder="0"
              aria-label="Discount value"
              aria-invalid={discountInvalid}
              className={cn(
                "h-9 w-20 rounded-lg border bg-white px-2 text-right tabular focus:border-rose focus:outline-none",
                discountInvalid ? "border-unpaid" : "border-beige",
              )}
            />
            <span className="w-16 text-right font-medium text-rose-dark tabular">−{formatMoney(totals.discountCents)}</span>
            <button
              type="button"
              onClick={() => onDiscountChange({ open: false, type: "FIXED", input: "" })}
              className="text-muted hover:text-ink"
              aria-label="Remove discount"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onDiscountChange({ ...discount, open: true })}
            className="inline-flex items-center gap-1.5 font-medium text-rose hover:text-rose-dark"
          >
            <Tag className="size-4" /> Add discount
          </button>
        )}

        <div className="flex items-baseline justify-between border-t border-beige/70 pt-2.5">
          <span className="text-base font-semibold text-ink">Final Total</span>
          <span className="font-display text-3xl font-bold text-ink tabular">{formatMoney(totals.finalTotalCents)}</span>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-ink-soft">
      <span>{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );
}
