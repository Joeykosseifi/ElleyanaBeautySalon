import Link from "next/link";
import { BarChart3, Info } from "lucide-react";
import { requireManager } from "@/server/auth-context";
import { getFullReport } from "@/server/services/reports";
import { formatMoney } from "@/lib/domain/money";
import { PAYMENT_METHODS } from "@/lib/domain/reports";
import { EXPENSE_CATEGORY_LABELS, PAYMENT_METHOD_LABELS, type ExpenseCategory } from "@/lib/domain/labels";
import { rangeFromParams, type SearchParams } from "@/lib/search-params";
import { PageHeader } from "@/components/layout/page-header";
import { DateRangeSelector } from "@/components/filters/date-range-selector";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricCard } from "@/components/reports/metric-card";
import { BarBreakdown, DailyChart } from "@/components/reports/report-chart";
import { PaymentBadge } from "@/components/sales/payment-badge";

export const metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireManager();
  const range = rangeFromParams(await searchParams, ctx.timezone, "month");
  const { summary: s, services, employees, daily, totalOutstandingCents } = await getFullReport(ctx, range);
  const isEmpty = s.salesCount === 0 && s.collectedRevenueCents === 0 && s.expensesCents === 0;

  const methodRows = PAYMENT_METHODS.map((m) => ({ label: PAYMENT_METHOD_LABELS[m], valueCents: s.paymentBreakdown[m] }));
  const expenseRows = Object.entries(s.expensesByCategory)
    .map(([k, v]) => ({ label: EXPENSE_CATEGORY_LABELS[k as ExpenseCategory] ?? k, valueCents: v }))
    .sort((a, b) => b.valueCents - a.valueCents);
  const anyCommission = employees.some((e) => e.estimatedCommissionCents !== null);

  return (
    <div>
      <PageHeader title="Reports" description="Service value, cash collected, balances and profit for any period." />
      <div className="mb-6">
        <DateRangeSelector value={range.preset} fromDay={range.fromDay} toDay={range.toDay} label={range.label} />
      </div>

      {isEmpty ? (
        <Card>
          <EmptyState icon={BarChart3} title="No activity in this period." description="Choose another date range, or add sales from Home." />
        </Card>
      ) : (
        <div className="space-y-6">
          <section aria-label="Key figures" className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <MetricCard label="Service Value" value={formatMoney(s.serviceValueCents)} hint="Services performed, after discounts" tone="gold" />
            <MetricCard label="Collected Revenue" value={formatMoney(s.collectedRevenueCents)} hint="Payments received in this period" tone="paid" />
            <MetricCard label="Outstanding" value={formatMoney(s.outstandingCents)} hint="Still owed on this period’s sales" tone={s.outstandingCents ? "unpaid" : "default"} />
            <MetricCard label="Est. Cash Profit" value={formatMoney(s.estimatedCashProfitCents)} hint="Collected − costs − expenses" tone={s.estimatedCashProfitCents < 0 ? "unpaid" : "rose"} />
            <MetricCard size="sm" label="Clients" value={s.clientsCount} hint="Unique clients + walk-ins" />
            <MetricCard size="sm" label="Services" value={s.servicesCount} hint={`${s.salesCount} sales`} />
            <MetricCard size="sm" label="Expenses" value={formatMoney(s.expensesCents)} />
            <MetricCard size="sm" label="Average Sale" value={formatMoney(s.averageSaleCents)} />
          </section>

          {daily.length > 1 && (
            <Card>
              <CardHeader title="Daily Trend" description="Service value is counted on the service date; collected on the payment date." />
              <CardBody>
                <DailyChart data={daily} />
              </CardBody>
            </Card>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Profit" description="Estimated — based on service cost estimates." />
              <CardBody>
                <dl className="space-y-2 text-sm">
                  <Row label="Collected Revenue" value={formatMoney(s.collectedRevenueCents)} />
                  <Row label="− Service Costs (estimated)" value={formatMoney(s.serviceCostsCents)} />
                  <Row label="− Operating Expenses" value={formatMoney(s.expensesCents)} />
                  <Row strong label="= Estimated Cash Profit" value={formatMoney(s.estimatedCashProfitCents)} tone={s.estimatedCashProfitCents < 0 ? "text-unpaid" : "text-paid"} />
                </dl>
                <dl className="mt-5 space-y-2 border-t border-beige pt-4 text-sm">
                  <Row label="Collected Revenue" value={formatMoney(s.collectedRevenueCents)} />
                  <Row label="+ Outstanding" value={formatMoney(s.outstandingCents)} />
                  <Row strong label="= Potential Revenue" value={formatMoney(s.potentialRevenueCents)} />
                  {s.discountsCents > 0 && <Row label="Discounts given" value={formatMoney(s.discountsCents)} />}
                  <Row label="Outstanding across all dates" value={formatMoney(totalOutstandingCents)} tone={totalOutstandingCents ? "text-unpaid" : undefined} />
                </dl>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Payment Breakdown" description="Money received in this period, by method." />
              <CardBody>
                {s.collectedRevenueCents === 0 ? (
                  <p className="text-sm text-muted">No payments received in this period.</p>
                ) : (
                  <BarBreakdown rows={methodRows} total={s.collectedRevenueCents} />
                )}
              </CardBody>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Payment Status" description="This period’s sales by their current status." />
              <CardBody>
                <div className="grid grid-cols-3 gap-3">
                  {(["PAID", "PARTIAL", "UNPAID"] as const).map((st) => (
                    <div key={st} className="rounded-2xl bg-cream/60 p-3">
                      <PaymentBadge status={st} long />
                      <p className="mt-2 text-2xl font-semibold tabular">{s.paymentStatus[st].count}</p>
                      <p className="text-xs text-muted">transactions</p>
                      <p className="mt-1 text-sm font-medium tabular">{formatMoney(s.paymentStatus[st].valueCents)}</p>
                      <p className="text-xs text-muted">sales value</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-between rounded-xl bg-unpaid-bg/60 px-4 py-3 text-sm">
                  <span className="text-ink-soft">Outstanding Balance</span>
                  <Link href="/clients/outstanding" className="font-semibold text-unpaid tabular hover:underline">
                    {formatMoney(s.outstandingCents)}
                  </Link>
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Expenses" description="Operating expenses dated in this period." />
              <CardBody>
                {expenseRows.length === 0 ? (
                  <p className="text-sm text-muted">No expenses recorded in this period.</p>
                ) : (
                  <BarBreakdown rows={expenseRows} total={s.expensesCents} />
                )}
              </CardBody>
            </Card>
          </div>

          <Card className="overflow-hidden">
            <CardHeader title="Services" description="Based on the price actually charged. Discounts and payments are shared across a sale’s services in proportion to price." />
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-y border-beige text-left text-xs tracking-wide text-muted uppercase">
                    <th className="py-2.5 pr-3 pl-5 font-medium sm:pl-6">Service</th>
                    <th className="px-3 py-2.5 text-right font-medium">Qty</th>
                    <th className="px-3 py-2.5 text-right font-medium">Service Value</th>
                    <th className="px-3 py-2.5 text-right font-medium">Collected</th>
                    <th className="px-3 py-2.5 text-right font-medium">Outstanding</th>
                    <th className="px-3 py-2.5 text-right font-medium">Est. Cost</th>
                    <th className="py-2.5 pr-5 pl-3 text-right font-medium sm:pr-6">Est. Gross Profit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-beige/60 tabular">
                  {services.map((m) => (
                    <tr key={m.key} className="hover:bg-cream/50">
                      <td className="py-2.5 pr-3 pl-5 sm:pl-6">
                        <span className="font-medium text-ink">{m.name}</span>
                        {m.isCustom ? (
                          <span className="ml-2 rounded-full bg-gold-soft px-1.5 py-0.5 text-[10px] font-semibold text-gold uppercase">Custom</span>
                        ) : (
                          m.category && <span className="ml-2 text-xs text-muted">{m.category}</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right">{m.quantity}</td>
                      <td className="px-3 py-2.5 text-right">{formatMoney(m.serviceValueCents)}</td>
                      <td className="px-3 py-2.5 text-right text-paid">{formatMoney(m.collectedCents)}</td>
                      <td className={`px-3 py-2.5 text-right ${m.outstandingCents ? "text-unpaid" : "text-muted"}`}>{formatMoney(m.outstandingCents)}</td>
                      <td className="px-3 py-2.5 text-right text-ink-soft">{formatMoney(m.estimatedCostCents)}</td>
                      <td className="py-2.5 pr-5 pl-3 text-right font-semibold sm:pr-6">{formatMoney(m.estimatedGrossProfitCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {services.length === 0 && <p className="px-6 py-4 text-sm text-muted">No services performed in this period.</p>}
            </div>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader title="Employees" />
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-y border-beige text-left text-xs tracking-wide text-muted uppercase">
                    <th className="py-2.5 pr-3 pl-5 font-medium sm:pl-6">Employee</th>
                    <th className="px-3 py-2.5 text-right font-medium">Clients</th>
                    <th className="px-3 py-2.5 text-right font-medium">Services</th>
                    <th className="px-3 py-2.5 text-right font-medium">Service Value</th>
                    <th className="px-3 py-2.5 text-right font-medium">Collected</th>
                    <th className="px-3 py-2.5 text-right font-medium">Outstanding</th>
                    {anyCommission && <th className="py-2.5 pr-5 pl-3 text-right font-medium sm:pr-6">Est. Commission</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-beige/60 tabular">
                  {employees.map((e) => (
                    <tr key={e.employeeId ?? "none"} className="hover:bg-cream/50">
                      <td className="py-2.5 pr-3 pl-5 font-medium sm:pl-6">{e.name}</td>
                      <td className="px-3 py-2.5 text-right">{e.clientsHandled}</td>
                      <td className="px-3 py-2.5 text-right">{e.servicesPerformed}</td>
                      <td className="px-3 py-2.5 text-right">{formatMoney(e.serviceValueCents)}</td>
                      <td className="px-3 py-2.5 text-right text-paid">{formatMoney(e.collectedRevenueCents)}</td>
                      <td className={`px-3 py-2.5 text-right ${e.outstandingCents ? "text-unpaid" : "text-muted"}`}>{formatMoney(e.outstandingCents)}</td>
                      {anyCommission && (
                        <td className="py-2.5 pr-5 pl-3 text-right sm:pr-6">
                          {e.estimatedCommissionCents === null ? <span className="text-muted">—</span> : formatMoney(e.estimatedCommissionCents)}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {anyCommission && (
              <p className="px-5 py-3 text-xs text-muted sm:px-6">Commission: percentage of service value, or a fixed amount per service performed.</p>
            )}
          </Card>

          <Card>
            <CardBody>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
                <Info className="size-4 text-gold" /> How these numbers are calculated
              </h2>
              <dl className="grid gap-x-8 gap-y-2 text-sm text-ink-soft md:grid-cols-2">
                <Def term="Service Value">Total of sales whose service date is in the period, after discounts.</Def>
                <Def term="Collected Revenue">Payments received in the period — including payments for older sales.</Def>
                <Def term="Outstanding">For this period’s sales: total minus everything paid so far.</Def>
                <Def term="Clients">Unique registered clients plus each walk-in visit.</Def>
                <Def term="Service Costs">Estimated cost of each service performed (cost at the time of sale).</Def>
                <Def term="Estimated Cash Profit">Collected Revenue − Service Costs − Operating Expenses.</Def>
                <Def term="Potential Revenue">Collected Revenue + Outstanding.</Def>
                <Def term="Average Sale">Service Value ÷ number of sales.</Def>
              </dl>
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: string }) {
  return (
    <div className={`flex justify-between ${strong ? "border-t border-beige pt-2 text-base font-semibold" : "text-ink-soft"}`}>
      <dt>{label}</dt>
      <dd className={`tabular ${tone ?? ""}`}>{value}</dd>
    </div>
  );
}

function Def({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-medium text-ink">{term}</dt>
      <dd>{children}</dd>
    </div>
  );
}
