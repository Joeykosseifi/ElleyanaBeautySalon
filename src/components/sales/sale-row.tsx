import Link from "next/link";
import { ChevronRight, Pencil } from "lucide-react";
import { formatMoney } from "@/lib/domain/money";
import { clientDisplayName, PAYMENT_METHOD_LABELS } from "@/lib/domain/labels";
import { fmtShortDate, fmtTime } from "@/lib/format";
import type { SaleView } from "@/server/services/sales";
import { PaymentBadge, VoidedBadge } from "./payment-badge";

export function serviceSummary(sale: Pick<SaleView, "items">) {
  return sale.items.map((i) => (i.quantity > 1 ? `${i.serviceNameSnapshot} ×${i.quantity}` : i.serviceNameSnapshot)).join(" + ");
}

export function methodSummary(sale: Pick<SaleView, "payments">) {
  const methods = [...new Set(sale.payments.map((p) => PAYMENT_METHOD_LABELS[p.method]))];
  return methods.length ? methods.join(", ") : "—";
}

/** Compact card row used on Home, client profiles and the mobile sales list. */
export function SaleRow({ sale, tz, showDate, canEdit }: { sale: SaleView; tz: string; showDate?: boolean; canEdit?: boolean }) {
  const row = (
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
        <p className={`font-semibold tabular ${sale.isVoided ? "text-muted line-through" : ""}`}>{formatMoney(sale.finalTotalCents)}</p>
        {sale.isVoided ? <VoidedBadge className="mt-0.5" /> : <PaymentBadge status={sale.paymentStatus} className="mt-0.5" />}
      </div>
      <ChevronRight className="size-4 shrink-0 text-sand group-hover:text-muted" />
    </Link>
  );
  if (!canEdit || sale.isVoided) return row;
  return (
    <div className="flex items-center gap-1">
      <div className="min-w-0 flex-1">{row}</div>
      <EditSaleLink saleId={sale.id} number={sale.number} />
    </div>
  );
}

/** The pencil "Edit sale" button used in the sales list (owner only, active sales). */
export function EditSaleLink({ saleId, number }: { saleId: string; number: number }) {
  return (
    <Link
      href={`/sales/${saleId}/edit`}
      aria-label={`Edit sale #${number}`}
      title="Edit sale"
      className="flex size-10 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-cream hover:text-ink"
    >
      <Pencil className="size-4" />
    </Link>
  );
}

/** Full table for larger screens on the Sales page. */
export function SalesTable({ sales, tz, showDate, canEdit }: { sales: SaleView[]; tz: string; showDate: boolean; canEdit?: boolean }) {
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
          {canEdit && <th className="py-3 pr-3 font-medium"><span className="sr-only">Edit</span></th>}
        </tr>
      </thead>
      <tbody className="divide-y divide-beige/60">
        {sales.map((s) => {
          const href = `/sales/${s.id}`;
          // Every cell holds a real link (no stretched ::after overlay on the row, which
          // depends on `position: relative` on <tr> and can cover the page in some
          // browsers). Only the first is focusable/announced, to avoid repetition.
          const cell = (content: React.ReactNode, className = "", first = false) => (
            <td className="p-0">
              <Link
                href={href}
                tabIndex={first ? undefined : -1}
                aria-hidden={first ? undefined : true}
                aria-label={first ? `Open sale #${s.number}` : undefined}
                className={`block px-3 py-3 ${className}`}
              >
                {content}
              </Link>
            </td>
          );
          return (
            <tr key={s.id} className={`hover:bg-cream/60 ${s.isVoided ? "opacity-60" : ""}`}>
              {cell(
                <>
                  {showDate ? `${fmtShortDate(s.createdAt, tz)}, ` : ""}
                  {fmtTime(s.createdAt, tz)}
                </>,
                "pl-5 whitespace-nowrap text-muted tabular",
                true,
              )}
              {cell(
                <>
                  <span className="block font-medium text-ink">{clientDisplayName(s.client)}</span>
                  {s.client?.phone && <span className="block text-xs text-muted">{s.client.phone}</span>}
                </>,
              )}
              {cell(<span className="line-clamp-2">{serviceSummary(s)}</span>, "max-w-64 text-ink-soft")}
              {cell(s.employeeNames.join(", ") || "—", "text-ink-soft")}
              {cell(formatMoney(s.finalTotalCents), `text-right font-semibold tabular ${s.isVoided ? "line-through" : ""}`)}
              {cell(formatMoney(s.amountPaidCents), "text-right tabular")}
              {cell(formatMoney(s.remainingCents), `text-right tabular ${s.remainingCents > 0 && !s.isVoided ? "font-medium text-unpaid" : "text-muted"}`)}
              {cell(s.isVoided ? <VoidedBadge /> : <PaymentBadge status={s.paymentStatus} />)}
              {cell(methodSummary(s), "pr-5 text-ink-soft")}
              {canEdit && <td className="py-1 pr-3">{!s.isVoided && <EditSaleLink saleId={s.id} number={s.number} />}</td>}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
