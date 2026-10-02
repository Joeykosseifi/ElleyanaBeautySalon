"use client";

import { cn } from "@/lib/utils";
import type { PaymentStatus } from "@/lib/domain/sale-calculations";

const OPTIONS: { value: PaymentStatus; label: string; hint: string; active: string }[] = [
  { value: "PAID", label: "Paid", hint: "Full amount", active: "border-paid bg-paid-bg text-paid" },
  { value: "PARTIAL", label: "Partially Paid", hint: "Some amount", active: "border-partial bg-partial-bg text-partial" },
  { value: "UNPAID", label: "Unpaid", hint: "Nothing yet", active: "border-unpaid bg-unpaid-bg text-unpaid" },
];

export function PaymentStatusSelector({
  value,
  onChange,
}: {
  value: PaymentStatus;
  onChange: (v: PaymentStatus) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Payment status">
      {OPTIONS.map((o) => {
        const selected = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex min-h-16 flex-col items-center justify-center rounded-2xl border-2 px-2 py-2 text-center transition-colors",
              selected ? o.active : "border-beige/80 bg-white text-ink-soft hover:bg-cream",
            )}
          >
            <span className="text-sm leading-tight font-semibold sm:text-[15px]">{o.label}</span>
            <span className={cn("mt-0.5 text-[11px]", selected ? "opacity-80" : "text-muted")}>{o.hint}</span>
          </button>
        );
      })}
    </div>
  );
}
