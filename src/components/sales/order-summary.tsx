"use client";

import { useEffect, useRef, useState } from "react";
import { Minus, Pencil, Plus, RotateCcw, Tag, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { centsToInput, formatMoney, toCents } from "@/lib/domain/money";
import { isPriceOverridden, MAX_LINE_QUANTITY, type CartLine } from "@/lib/domain/cart";
import type { SaleTotals } from "@/lib/domain/sale-calculations";

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
  onPrice,
  onResetPrice,
  onRemove,
  onEditCustom,
  discountInvalid,
}: {
  lines: CartLine[];
  totals: SaleTotals;
  discount: DiscountDraft;
  onDiscountChange: (d: DiscountDraft) => void;
  onQuantity: (key: string, qty: number) => void;
  onPrice: (key: string, cents: number) => void;
  onResetPrice: (key: string) => void;
  onRemove: (key: string) => void;
  onEditCustom: (key: string) => void;
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
        {lines.map((l) => {
          const overridden = isPriceOverridden(l);
          return (
            <li key={l.key} className="py-2.5 first:pt-0.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {l.kind === "custom" ? (
                    <button
                      type="button"
                      onClick={() => onEditCustom(l.key)}
                      className="group inline-flex max-w-full items-center gap-1.5 text-left font-medium text-ink"
                      aria-label={`Edit custom service ${l.name}`}
                    >
                      <span className="truncate">{l.name}</span>
                      <span className="shrink-0 rounded-full bg-gold-soft px-1.5 py-0.5 text-[10px] font-semibold text-gold uppercase">Custom</span>
                      <Pencil className="size-3.5 shrink-0 text-muted group-hover:text-ink" />
                    </button>
                  ) : (
                    <p className="truncate font-medium text-ink">{l.name}</p>
                  )}
                  {overridden && l.kind === "catalog" && (
                    <p className="mt-0.5 text-xs text-muted">
                      Standard price: <span className="line-through">{formatMoney(l.standardPriceCents)}</span>
                      <span className="mx-1">·</span>
                      Charged: <span className="font-semibold text-rose-dark">{formatMoney(l.unitPriceCents)}</span>
                      <button
                        type="button"
                        onClick={() => onResetPrice(l.key)}
                        className="ml-2 inline-flex items-center gap-0.5 font-medium text-rose hover:text-rose-dark"
                        aria-label={`Reset ${l.name} to standard price`}
                      >
                        <RotateCcw className="size-3" /> Reset
                      </button>
                    </p>
                  )}
                  {l.unitPriceCents === 0 && <p className="mt-0.5 text-xs font-medium text-paid">Complimentary</p>}
                </div>
                <span className="shrink-0 font-semibold tabular">{formatMoney(l.unitPriceCents * l.quantity)}</span>
              </div>

              <div className="mt-1.5 flex items-center gap-2">
                <PriceEditor
                  name={l.name}
                  cents={l.unitPriceCents}
                  highlighted={overridden}
                  onCommit={(cents) => onPrice(l.key, cents)}
                />
                <span className="flex-1" />
                <div className="flex items-center rounded-full border border-beige bg-white">
                  <button
                    type="button"
                    onClick={() => (l.quantity > 1 ? onQuantity(l.key, l.quantity - 1) : onRemove(l.key))}
                    className="flex size-9 items-center justify-center rounded-full text-ink-soft hover:bg-cream"
                    aria-label={`Decrease ${l.name}`}
                  >
                    <Minus className="size-4" />
                  </button>
                  <span className="w-6 text-center text-sm font-semibold tabular" aria-label={`${l.name} quantity`}>
                    {l.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => onQuantity(l.key, Math.min(l.quantity + 1, MAX_LINE_QUANTITY))}
                    className="flex size-9 items-center justify-center rounded-full text-ink-soft hover:bg-cream"
                    aria-label={`Increase ${l.name}`}
                  >
                    <Plus className="size-4" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(l.key)}
                  className="flex size-9 items-center justify-center rounded-full text-muted hover:bg-unpaid-bg hover:text-unpaid"
                  aria-label={`Remove ${l.name}`}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-2 space-y-2 border-t border-beige/70 pt-3 text-sm">
        <div className="flex justify-between text-ink-soft">
          <span>Subtotal</span>
          <span className="tabular">{formatMoney(totals.subtotalCents)}</span>
        </div>

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
                  className={cn("h-8 w-9 rounded-md text-sm font-semibold", discount.type === t ? "bg-rose text-white" : "text-ink-soft")}
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

/**
 * The unit price shown as a tappable chip. Tap → type → Enter (or tap away) to
 * apply; Escape cancels. Only affects this sale.
 */
function PriceEditor({
  name,
  cents,
  highlighted,
  onCommit,
}: {
  name: string;
  cents: number;
  highlighted: boolean;
  onCommit: (cents: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(centsToInput(cents));
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const open = () => {
    setValue(centsToInput(cents));
    setError(null);
    setEditing(true);
  };

  const commit = () => {
    const parsed = toCents(value);
    if (value.trim() === "" || Number.isNaN(parsed)) return setError("Enter a valid price.");
    if (parsed < 0) return setError("Price cannot be negative.");
    onCommit(parsed);
    setEditing(false);
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={open}
        aria-label={`Change price for ${name}, currently ${formatMoney(cents)}`}
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-full border border-dashed px-3 text-sm font-medium tabular transition-colors",
          highlighted ? "border-rose bg-blush/70 text-rose-dark" : "border-sand bg-white text-ink-soft hover:border-rose hover:text-rose-dark",
        )}
      >
        {formatMoney(cents)} each
        <Pencil className="size-3.5" />
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-sm text-muted">$</span>
        <input
          ref={inputRef}
          inputMode="decimal"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setEditing(false);
            }
          }}
          onBlur={commit}
          aria-label={`Price charged for ${name}`}
          aria-invalid={Boolean(error)}
          className={cn(
            "h-9 w-24 rounded-full border bg-white pr-3 pl-6 text-sm font-semibold tabular focus:ring-2 focus:ring-rose/20 focus:outline-none",
            error ? "border-unpaid" : "border-rose",
          )}
        />
      </div>
      {error && (
        <span className="text-xs text-unpaid" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
