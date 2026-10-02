"use client";

import { Banknote, CreditCard, Landmark, Smartphone, Send, CircleEllipsis } from "lucide-react";
import { cn } from "@/lib/utils";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/domain/reports";
import { PAYMENT_METHOD_LABELS } from "@/lib/domain/labels";

const ICONS = {
  CASH: Banknote,
  CARD: CreditCard,
  BANK_TRANSFER: Landmark,
  WHISH: Smartphone,
  OMT: Send,
  OTHER: CircleEllipsis,
} as const;

export function PaymentMethodSelector({
  value,
  onChange,
  error,
}: {
  value: PaymentMethod | null;
  onChange: (v: PaymentMethod) => void;
  error?: boolean;
}) {
  return (
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Payment method">
      {PAYMENT_METHODS.map((m) => {
        const Icon = ICONS[m];
        const selected = value === m;
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(m)}
            className={cn(
              "flex h-12 items-center justify-center gap-2 rounded-xl border-2 px-2 text-sm font-medium transition-colors",
              selected
                ? "border-rose bg-blush text-rose-dark"
                : cn("bg-white text-ink-soft hover:bg-cream", error ? "border-unpaid/40" : "border-beige/80"),
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span className="truncate">{m === "BANK_TRANSFER" ? "Transfer" : PAYMENT_METHOD_LABELS[m]}</span>
          </button>
        );
      })}
    </div>
  );
}
