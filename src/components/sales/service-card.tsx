"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/domain/money";
import type { QuickService } from "./types";

export function ServiceCard({
  service,
  quantity,
  onToggle,
}: {
  service: QuickService;
  quantity: number;
  onToggle: () => void;
}) {
  const selected = quantity > 0;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className={cn(
        "relative flex min-h-[88px] flex-col justify-between rounded-2xl border-2 p-3.5 text-left transition-all active:scale-[0.98] sm:min-h-24",
        selected
          ? "border-rose bg-blush shadow-soft"
          : "border-beige/80 bg-white hover:border-blush-strong hover:bg-blush/40",
      )}
    >
      <span className={cn("pr-7 text-[15px] leading-snug font-semibold", selected ? "text-rose-dark" : "text-ink")}>
        {service.name}
      </span>
      <span className="mt-2 flex items-end justify-between gap-2">
        <span className={cn("text-lg font-semibold tabular", selected ? "text-rose-dark" : "text-ink-soft")}>
          {formatMoney(service.priceCents)}
        </span>
        {service.durationMinutes ? <span className="text-xs text-muted">{service.durationMinutes} min</span> : null}
      </span>
      <span
        className={cn(
          "absolute top-3 right-3 flex size-6 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors",
          selected ? "border-rose bg-rose text-white" : "border-beige bg-white",
        )}
        aria-hidden="true"
      >
        {selected ? quantity > 1 ? quantity : <Check className="size-3.5" strokeWidth={3} /> : null}
      </span>
    </button>
  );
}
