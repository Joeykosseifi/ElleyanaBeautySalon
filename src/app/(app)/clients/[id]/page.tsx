import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, Phone, Receipt } from "lucide-react";
import { requireAppContext } from "@/server/auth-context";
import { getClientProfile } from "@/server/services/clients";
import { formatMoney } from "@/lib/domain/money";
import { clientDisplayName } from "@/lib/domain/labels";
import { fmtDate } from "@/lib/format";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricCard } from "@/components/reports/metric-card";
import { ClientFormButton } from "@/components/clients/client-form";
import { PaymentBadge } from "@/components/sales/payment-badge";
import { serviceSummary } from "@/components/sales/sale-row";
import { AddPaymentButton } from "@/components/sales/add-payment-dialog";

export const metadata = { title: "Client" };

export default async function ClientProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAppContext();
  const { id } = await params;
  const profile = await getClientProfile(ctx, id);
  if (!profile) notFound();
  const { client, sales, totals, lastVisit } = profile;
  const tz = ctx.timezone;
  const name = clientDisplayName(client);
  const owing = sales.filter((s) => s.remainingCents > 0);

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/clients" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Clients
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex size-14 items-center justify-center rounded-full bg-blush font-display text-2xl font-bold text-rose">
            {client.firstName.slice(0, 1).toUpperCase()}
          </div>
          <div>
            <h1 className="font-display text-3xl font-semibold text-ink sm:text-4xl">{name}</h1>
            <div className="flex flex-wrap gap-x-4 text-sm text-ink-soft">
              {client.phone && (
                <a href={`tel:${client.phone}`} className="inline-flex items-center gap-1 hover:text-rose-dark">
                  <Phone className="size-3.5" /> {client.phone}
                </a>
              )}
              {client.email && (
                <a href={`mailto:${client.email}`} className="inline-flex items-center gap-1 hover:text-rose-dark">
                  <Mail className="size-3.5" /> {client.email}
                </a>
              )}
            </div>
          </div>
        </div>
        <ClientFormButton id={client.id} client={client} />
      </div>

      {client.notes && (
        <p className="mb-5 rounded-2xl border border-gold/20 bg-gold-soft/60 px-4 py-3 text-sm whitespace-pre-wrap text-ink-soft">{client.notes}</p>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <MetricCard size="sm" label="Total Visits" value={totals.visits} />
        <MetricCard size="sm" label="Total Services" value={totals.services} />
        <MetricCard size="sm" label="Service Value" value={formatMoney(totals.serviceValueCents)} />
        <MetricCard size="sm" label="Total Paid" value={formatMoney(totals.paidCents)} tone="paid" />
        <MetricCard size="sm" label="Outstanding" value={formatMoney(totals.outstandingCents)} tone={totals.outstandingCents ? "unpaid" : "default"} />
        <MetricCard size="sm" label="Last Visit" value={lastVisit ? fmtDate(lastVisit, tz).replace(/, \d{4}$/, "") : "—"} />
      </div>

      {owing.length > 0 && (
        <Card className="mb-5 border-unpaid/20">
          <CardHeader title="Unpaid balances" description={`${name} owes ${formatMoney(totals.outstandingCents)} across ${owing.length} sale(s).`} />
          <ul className="divide-y divide-beige/60 px-5 pt-2 pb-3 sm:px-6">
            {owing.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <Link href={`/sales/${s.id}`} className="min-w-0 hover:text-rose-dark">
                  <p className="font-medium">
                    Sale #{s.number} · {fmtDate(s.createdAt, tz)}
                  </p>
                  <p className="text-sm text-muted">
                    {serviceSummary(s)} · Total {formatMoney(s.finalTotalCents)}, paid {formatMoney(s.amountPaidCents)}
                  </p>
                </Link>
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-unpaid tabular">{formatMoney(s.remainingCents)}</span>
                  <AddPaymentButton saleId={s.id} saleNumber={s.number} remainingCents={s.remainingCents} clientName={name} size="sm" />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardHeader title="Visit History" />
        {sales.length === 0 ? (
          <EmptyState icon={Receipt} title="No visits yet." description="Sales for this client will appear here." />
        ) : (
          <ul className="divide-y divide-beige/60 px-2 pt-2 pb-2 sm:px-3">
            {sales.map((s) => (
              <li key={s.id}>
                <Link href={`/sales/${s.id}`} className="flex items-start justify-between gap-3 rounded-xl px-3 py-3 hover:bg-cream/60">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink-soft">{fmtDate(s.createdAt, tz)}</p>
                    <p className="font-medium text-ink">{serviceSummary(s)}</p>
                    <p className="text-sm text-muted tabular">
                      Total {formatMoney(s.finalTotalCents)}
                      {s.paymentStatus !== "PAID" && ` · Paid ${formatMoney(s.amountPaidCents)} · Remaining ${formatMoney(s.remainingCents)}`}
                      {s.employeeNames.length > 0 && ` · ${s.employeeNames.join(", ")}`}
                    </p>
                  </div>
                  <PaymentBadge status={s.paymentStatus} className="mt-1 shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
