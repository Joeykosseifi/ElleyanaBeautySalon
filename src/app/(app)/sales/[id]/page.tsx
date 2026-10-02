import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CircleDollarSign, FileText, Phone, Receipt } from "lucide-react";
import { requireAppContext } from "@/server/auth-context";
import { getSale } from "@/server/services/sales";
import { formatMoney, formatPercent } from "@/lib/domain/money";
import { clientDisplayName, PAYMENT_METHOD_LABELS } from "@/lib/domain/labels";
import { fmtDate, fmtDateTime, fmtTime } from "@/lib/format";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PaymentBadge } from "@/components/sales/payment-badge";
import { AddPaymentButton } from "@/components/sales/add-payment-dialog";

export const metadata = { title: "Sale details" };

export default async function SaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAppContext();
  const { id } = await params;
  const sale = await getSale(ctx, id);
  if (!sale) notFound();
  const tz = ctx.timezone;
  const clientName = clientDisplayName(sale.client);

  // Running balance for the payment history timeline
  let runningPaid = 0;
  const history = sale.payments.map((p) => {
    runningPaid += p.amountCents;
    return { ...p, remainingAfter: Math.max(0, sale.finalTotalCents - runningPaid) };
  });

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/sales" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Sales
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted">Sale #{sale.number}</p>
          <h1 className="font-display text-3xl font-semibold text-ink sm:text-4xl">
            {sale.client ? (
              <Link href={`/clients/${sale.client.id}`} className="hover:text-rose-dark">
                {clientName}
              </Link>
            ) : (
              clientName
            )}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-soft">
            <span>{fmtDate(sale.createdAt, tz)}</span>
            <span>{fmtTime(sale.createdAt, tz)}</span>
            {sale.employee && <span>Employee: {sale.employee.name}</span>}
            {sale.client?.phone && (
              <a href={`tel:${sale.client.phone}`} className="inline-flex items-center gap-1 hover:text-rose-dark">
                <Phone className="size-3.5" /> {sale.client.phone}
              </a>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <PaymentBadge status={sale.paymentStatus} long className="px-3 py-1 text-sm" />
          {sale.remainingCents > 0 && (
            <AddPaymentButton saleId={sale.id} saleNumber={sale.number} remainingCents={sale.remainingCents} clientName={clientName} />
          )}
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_300px]">
        <Card>
          <CardHeader title="Services" />
          <CardBody>
            <ul className="divide-y divide-beige/60">
              {sale.items.map((i) => {
                const overridden = i.standardPriceSnapshotCents !== null && i.standardPriceSnapshotCents !== i.unitPriceChargedCents;
                return (
                  <li key={i.id} className="flex items-baseline justify-between gap-3 py-2.5 first:pt-0">
                    <div>
                      <p className="font-medium text-ink">
                        {i.serviceNameSnapshot}
                        {i.isCustom && (
                          <span className="ml-2 rounded-full bg-gold-soft px-1.5 py-0.5 align-middle text-[10px] font-semibold text-gold uppercase">Custom</span>
                        )}
                      </p>
                      <p className="text-xs text-muted">
                        {i.categoryNameSnapshot ? `${i.categoryNameSnapshot} · ` : ""}
                        {overridden ? (
                          <>
                            Standard price: <span className="line-through">{formatMoney(i.standardPriceSnapshotCents!)}</span> · Charged:{" "}
                            <span className="font-medium text-rose-dark">{formatMoney(i.unitPriceChargedCents)}</span>
                          </>
                        ) : (
                          formatMoney(i.unitPriceChargedCents)
                        )}
                        {i.quantity > 1 ? ` × ${i.quantity}` : ""}
                        {i.unitPriceChargedCents === 0 ? " · Complimentary" : ""}
                      </p>
                    </div>
                    <span className="font-semibold tabular">{formatMoney(i.lineTotalCents)}</span>
                  </li>
                );
              })}
            </ul>
            <dl className="mt-3 space-y-1.5 border-t border-beige pt-3 text-sm">
              <Line label="Subtotal" value={formatMoney(sale.subtotalCents)} />
              <Line
                label={`Discount${sale.discountType === "PERCENTAGE" ? ` (${formatPercent(sale.discountValue)})` : ""}`}
                value={sale.discountCents ? `−${formatMoney(sale.discountCents)}` : formatMoney(0)}
              />
              <div className="flex items-baseline justify-between pt-1.5">
                <dt className="text-base font-semibold">Final Total</dt>
                <dd className="font-display text-3xl font-bold tabular">{formatMoney(sale.finalTotalCents)}</dd>
              </div>
            </dl>
          </CardBody>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardBody className="space-y-3">
              <Big label="Amount Paid" value={formatMoney(sale.amountPaidCents)} tone="text-paid" />
              <Big label="Amount Remaining" value={formatMoney(sale.remainingCents)} tone={sale.remainingCents ? "text-unpaid" : "text-ink"} />
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted">Payment Status</span>
                <PaymentBadge status={sale.paymentStatus} long />
              </div>
            </CardBody>
          </Card>
          {sale.notes && (
            <Card>
              <CardBody>
                <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted uppercase">
                  <FileText className="size-3.5" /> Notes
                </p>
                <p className="text-sm whitespace-pre-wrap text-ink-soft">{sale.notes}</p>
              </CardBody>
            </Card>
          )}
        </div>
      </div>

      <Card className="mt-5">
        <CardHeader title="Payment History" description="Every payment is kept — history is never overwritten." />
        <CardBody>
          <ol className="relative space-y-5 border-l-2 border-beige pl-6">
            <TimelineItem icon={<Receipt className="size-3.5" />} date={fmtDateTime(sale.createdAt, tz)}>
              <p className="font-medium text-ink">Sale created{sale.createdBy ? ` by ${sale.createdBy.name}` : ""}</p>
              <p className="text-sm text-ink-soft">Total owed: {formatMoney(sale.finalTotalCents)}</p>
            </TimelineItem>
            {history.map((p) => (
              <TimelineItem key={p.id} icon={<CircleDollarSign className="size-3.5" />} date={fmtDateTime(p.createdAt, tz)} tone="paid">
                <p className="font-medium text-ink">
                  Payment: {formatMoney(p.amountCents)} {PAYMENT_METHOD_LABELS[p.method]}
                </p>
                <p className="text-sm text-ink-soft">
                  Remaining after: {formatMoney(p.remainingAfter)}
                  {p.receivedBy ? ` · Received by ${p.receivedBy.name}` : ""}
                </p>
                {p.notes && <p className="text-sm text-muted italic">{p.notes}</p>}
              </TimelineItem>
            ))}
            {history.length === 0 && (
              <li className="text-sm text-muted">No payments yet.</li>
            )}
          </ol>
          <div className="mt-6 grid grid-cols-2 gap-3 rounded-2xl bg-cream/60 p-4 text-sm">
            <div>
              <p className="text-xs text-muted uppercase">Total paid</p>
              <p className="text-lg font-semibold tabular">{formatMoney(sale.amountPaidCents)}</p>
            </div>
            <div>
              <p className="text-xs text-muted uppercase">Remaining</p>
              <p className={`text-lg font-semibold tabular ${sale.remainingCents ? "text-unpaid" : ""}`}>{formatMoney(sale.remainingCents)}</p>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-ink-soft">
      <dt>{label}</dt>
      <dd className="tabular">{value}</dd>
    </div>
  );
}

function Big({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div>
      <p className="text-xs font-medium tracking-wide text-muted uppercase">{label}</p>
      <p className={`text-2xl font-semibold tabular ${tone}`}>{value}</p>
    </div>
  );
}

function TimelineItem({ icon, date, children, tone }: { icon: React.ReactNode; date: string; children: React.ReactNode; tone?: "paid" }) {
  return (
    <li className="relative">
      <span
        className={`absolute top-0.5 -left-[35px] flex size-6 items-center justify-center rounded-full border-2 border-white ${tone === "paid" ? "bg-paid-bg text-paid" : "bg-gold-soft text-gold"}`}
      >
        {icon}
      </span>
      <p className="text-xs text-muted">{date}</p>
      {children}
    </li>
  );
}
