import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { formatMoney } from "@/lib/domain/money";
import { clientDisplayName, PAYMENT_METHOD_LABELS } from "@/lib/domain/labels";
import { fmtShortDate, fmtTime } from "@/lib/format";
import type { SaleView } from "@/server/services/sales";
import { PaymentBadge } from "./payment-badge";

export function serviceSummary(sale: Pick<SaleView, "items">) {
  return sale.items.map((i) => (i.quantity > 1 ? `${i.serviceNameSnapshot} ×${i.quantity}` : i.serviceNameSnapshot)).join(" + ");
}

export function methodSummary(sale: Pick<SaleView, "payments">) {
  const methods = [...new Set(sale.payments.map((p) => PAYMENT_METHOD_LABELS[p.method]))];
  return methods.length ? methods.join(", ") : "—";
}

/** Compact card row used on Home, client profiles and the mobile sales list. */
export function SaleRow({ sale, tz, showDate }: { sale: SaleView; tz: string; showDate?: boolean }) {
  return (
    <Link
      href={`/sales/${sale.id}`}
      className="group flex items-center gap-3 rounded-2xl px-3 py-3 transition-colors hover:bg-cream/70"
    >
      <div className="w-14 shrink-0 text-xs text-muted tabular">
        {showDate && <div className="font-medium text-ink-soft">{fmtShortDate(sale.createdAt, tz)}</div>}
        {fmtTime(sale.createdAt, tz)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-ink">{clientDisplayName(sale.client)}</p>
        <p className="truncate text-sm text-muted">{serviceSummary(sale)}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-semibold tabular">{formatMoney(sale.finalTotalCents)}</p>
        <PaymentBadge status={sale.paymentStatus} className="mt-0.5" />
      </div>
      <ChevronRight className="size-4 shrink-0 text-sand group-hover:text-muted" />
    </Link>
  );
}

/** Full table for larger screens on the Sales page. */
export function SalesTable({ sales, tz, showDate }: { sales: SaleView[]; tz: string; showDate: boolean }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-beige text-left text-xs font-medium tracking-wide text-muted uppercase">
          <th className="py-3 pr-3 pl-5 font-medium">{showDate ? "Date" : "Time"}</th>
          <th className="px-3 py-3 font-medium">Client</th>
          <th className="px-3 py-3 font-medium">Services</th>
          <th className="px-3 py-3 font-medium">Employee</th>
          <th className="px-3 py-3 text-right font-medium">Total</th>
          <th className="px-3 py-3 text-right font-medium">Paid</th>
          <th className="px-3 py-3 text-right font-medium">Remaining</th>
          <th className="px-3 py-3 font-medium">Status</th>
          <th className="py-3 pr-5 pl-3 font-medium">Method</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-beige/60">
        {sales.map((s) => (
          <tr key={s.id} className="group relative hover:bg-cream/60">
            <td className="py-3 pr-3 pl-5 whitespace-nowrap text-muted tabular">
              <Link href={`/sales/${s.id}`} className="after:absolute after:inset-0" aria-label={`Open sale #${s.number}`}>
                {showDate ? `${fmtShortDate(s.createdAt, tz)}, ` : ""}
                {fmtTime(s.createdAt, tz)}
              </Link>
            </td>
            <td className="px-3 py-3">
              <div className="font-medium text-ink">{clientDisplayName(s.client)}</div>
              {s.client?.phone && <div className="text-xs text-muted">{s.client.phone}</div>}
            </td>
            <td className="max-w-64 px-3 py-3 text-ink-soft">
              <span className="line-clamp-2">{serviceSummary(s)}</span>
            </td>
            <td className="px-3 py-3 text-ink-soft">{s.employee?.name ?? "—"}</td>
            <td className="px-3 py-3 text-right font-semibold tabular">{formatMoney(s.finalTotalCents)}</td>
            <td className="px-3 py-3 text-right tabular">{formatMoney(s.amountPaidCents)}</td>
            <td className={`px-3 py-3 text-right tabular ${s.remainingCents > 0 ? "font-medium text-unpaid" : "text-muted"}`}>
              {formatMoney(s.remainingCents)}
            </td>
            <td className="px-3 py-3">
              <PaymentBadge status={s.paymentStatus} />
            </td>
            <td className="py-3 pr-5 pl-3 text-ink-soft">{methodSummary(s)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
