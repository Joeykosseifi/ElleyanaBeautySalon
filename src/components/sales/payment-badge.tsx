import { Ban, CheckCircle2, CircleDashed, CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { PAYMENT_STATUS_LABELS } from "@/lib/domain/labels";
import type { PaymentStatus } from "@/lib/domain/sale-calculations";

const styles: Record<PaymentStatus, string> = {
  PAID: "bg-paid-bg text-paid",
  PARTIAL: "bg-partial-bg text-partial",
  UNPAID: "bg-unpaid-bg text-unpaid",
};
const icons = { PAID: CheckCircle2, PARTIAL: CircleDashed, UNPAID: CircleAlert };
const short: Record<PaymentStatus, string> = { PAID: "Paid", PARTIAL: "Partial", UNPAID: "Unpaid" };

export function PaymentBadge({ status, long, className }: { status: PaymentStatus; long?: boolean; className?: string }) {
  const Icon = icons[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
        styles[status],
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {long ? PAYMENT_STATUS_LABELS[status] : short[status]}
    </span>
  );
}

/** Shown instead of the payment status once a sale has been voided. */
export function VoidedBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-unpaid/30 bg-white px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap text-unpaid",
        className,
      )}
    >
      <Ban className="size-3.5" aria-hidden="true" />
      Voided
    </span>
  );
}
