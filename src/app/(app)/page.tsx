import Link from "next/link";
import { Receipt } from "lucide-react";
import { requireAppContext } from "@/server/auth-context";
import { listCatalog, listEmployees } from "@/server/services/catalog";
import { getSummary } from "@/server/services/reports";
import { listSales } from "@/server/services/sales";
import { greetingFor, resolveDateRange } from "@/lib/domain/date-range";
import { formatMoney } from "@/lib/domain/money";
import { fmtDate } from "@/lib/format";
import { QuickAddSale } from "@/components/sales/quick-add-sale";
import { SaleRow } from "@/components/sales/sale-row";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "Home" };

export default async function HomePage() {
  const ctx = await requireAppContext();
  const today = resolveDateRange("today", ctx.timezone);
  const [catalog, employees, summary, recent] = await Promise.all([
    listCatalog(ctx, { activeOnly: true }),
    listEmployees(ctx, { activeOnly: true }),
    getSummary(ctx, today),
    listSales(ctx, { start: today.start, end: today.end, take: 8 }),
  ]);
  const now = new Date();

  const categories = catalog.map((c) => ({
    id: c.id,
    name: c.name,
    services: c.services.map((s) => ({ id: s.id, name: s.name, priceCents: s.priceCents, durationMinutes: s.durationMinutes })),
  }));

  return (
    <div>
      <div className="mb-4 lg:mb-6">
        <h1 className="font-display text-3xl font-semibold text-ink sm:text-4xl">
          {greetingFor(now, ctx.timezone)}, {ctx.user.name}
        </h1>
        <p className="text-sm text-muted">{fmtDate(now, ctx.timezone)}</p>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px] 2xl:grid-cols-[minmax(0,1fr)_420px]">
        <QuickAddSale categories={categories} employees={employees.map((e) => ({ id: e.id, name: e.name }))} />

        <aside className="space-y-5 xl:sticky xl:top-8" aria-label="Today">
          <Card>
            <CardHeader title="Today’s Summary" description="Updates after every sale." />
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-b-3xl px-5 pt-3 pb-5 sm:grid-cols-3 sm:px-6 xl:grid-cols-2">
              <Stat label="Service Value" value={formatMoney(summary.serviceValueCents)} />
              <Stat label="Collected" value={formatMoney(summary.collectedRevenueCents)} tone="text-paid" />
              <Stat label="Outstanding" value={formatMoney(summary.outstandingCents)} tone={summary.outstandingCents ? "text-unpaid" : undefined} />
              <Stat label="Clients" value={String(summary.clientsCount)} />
              <Stat label="Services" value={String(summary.servicesCount)} />
              <Stat label="Sales" value={String(summary.salesCount)} />
            </dl>
          </Card>

          <Card>
            <CardHeader
              title="Recent Transactions"
              action={
                <Link href="/sales" className="text-sm font-medium text-rose hover:text-rose-dark">
                  View all
                </Link>
              }
            />
            <div className="px-2 pt-2 pb-3">
              {recent.length === 0 ? (
                <EmptyState icon={Receipt} title="No sales yet today." description="Start by adding your first sale." className="py-8" />
              ) : (
                recent.map((s) => <SaleRow key={s.id} sale={s} tz={ctx.timezone} />)
              )}
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="py-2">
      <dt className="text-xs font-medium tracking-wide text-muted uppercase">{label}</dt>
      <dd className={`text-xl font-semibold tabular ${tone ?? "text-ink"}`}>{value}</dd>
    </div>
  );
}
