import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function MetricCard({
  label,
  value,
  hint,
  tone = "default",
  className,
  size = "md",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "paid" | "partial" | "unpaid" | "rose" | "gold";
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div className={cn("rounded-2xl border border-beige/70 bg-white p-4 shadow-soft", size === "sm" && "p-3.5", className)}>
      <p className="text-xs font-medium tracking-wide text-muted uppercase">{label}</p>
      <p
        className={cn(
          "mt-1 font-semibold tabular text-ink",
          size === "md" ? "text-2xl" : "text-xl",
          tone === "paid" && "text-paid",
          tone === "partial" && "text-partial",
          tone === "unpaid" && "text-unpaid",
          tone === "rose" && "text-rose-dark",
          tone === "gold" && "text-gold",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
