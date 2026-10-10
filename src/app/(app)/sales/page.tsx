import Link from "next/link";
import { Plus, Receipt, SearchX } from "lucide-react";
import { requireAppContext } from "@/server/auth-context";
import { listSales } from "@/server/services/sales";
import { salesFilterSchema } from "@/lib/validation/sale";
import { formatMoney } from "@/lib/domain/money";
import { param, rangeFromParams, type SearchParams } from "@/lib/search-params";
import { PageHeader } from "@/components/layout/page-header";
import { DateRangeSelector } from "@/components/filters/date-range-selector";
import { SearchInput } from "@/components/filters/search-input";
import { LinkChips } from "@/components/filters/link-chips";
import { SaleRow, SalesTable } from "@/components/sales/sale-row";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricCard } from "@/components/reports/metric-card";

export const metadata = { title: "Sales" };

const LIMIT = 300;
const STATUS_FILTERS = [
  { value: undefined, label: "All" },
  { value: "PAID", label: "Paid" },
  { value: "PARTIAL", label: "Partial" },
  { value: "UNPAID", label: "Unpaid" },
  { value: "OUTSTANDING", label: "Owing" },
  { value: "VOIDED", label: "Voided" },
] as const;

export default async function SalesPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireAppContext();
  const sp = await searchParams;
  const range = rangeFromParams(sp, ctx.timezone, "today");
  const filters = salesFilterSchema.safeParse({ q: param(sp, "q"), status: param(sp, "status") });
  const { q, status } = filters.success ? filters.data : { q: "", status: undefined };
  const sales = await listSales(ctx, { start: range.start, end: range.end, q, status, take: LIMIT });

  const totals = sales.reduce(
    (t, s) => ({ total: t.total + s.finalTotalCents, paid: t.paid + s.amountPaidCents, remaining: t.remaining + s.remainingCents }),
    { total: 0, paid: 0, remaining: 0 },
  );
  const multiDay = range.fromDay !== range.toDay;

  const hrefFor = (statusValue?: string) => {
    const next = new URLSearchParams();
    for (const k of ["range", "from", "to", "q"]) {
      const v = param(sp, k);
      if (v) next.set(k, v);
    }
    if (statusValue) next.set("status", statusValue);
    return `/sales?${next.toString()}`;
  };

  return (
    <div>
      <PageHeader
        title="Sales"
        description="Every transaction, with what was paid and what is still owed."
        actions={
          <Link href="/" className="inline-flex h-11 items-center gap-2 rounded-xl bg-rose px-4 text-sm font-medium text-white shadow-soft hover:bg-rose-dark">
            <Plus className="size-4" /> New Sale
          </Link>
        }
      />

      <div className="mb-5 space-y-3">
        <DateRangeSelector
          value={range.preset}
          fromDay={range.fromDay}
          toDay={range.toDay}
          label={range.label}
          presets={["today", "yesterday", "week", "month", "custom"]}
        />
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <SearchInput placeholder="Search client, phone, employee or service…" className="md:max-w-md md:flex-1" />
          <LinkChips items={STATUS_FILTERS.map((f) => ({ href: hrefFor(f.value), label: f.label, active: status === f.value }))} />
        </div>
      </div>

      {status === "VOIDED" ? (
        <p className="mb-5 rounded-2xl border border-unpaid/20 bg-unpaid-bg/60 px-4 py-3 text-sm text-ink-soft">
          Voided sales are kept for your records only. They are not included in any total, balance or report.
        </p>
      ) : (
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard size="sm" label="Sales" value={sales.length} />
        <MetricCard size="sm" label="Total" value={formatMoney(totals.total)} />
        <MetricCard size="sm" label="Paid" value={formatMoney(totals.paid)} tone="paid" />
        <MetricCard size="sm" label="Remaining" value={formatMoney(totals.remaining)} tone={totals.remaining ? "unpaid" : "default"} />
      </div>
      )}

      <Card className="overflow-hidden">
        {sales.length === 0 ? (
          status === "VOIDED" && !q ? (
            <EmptyState icon={Receipt} title="No voided sales in this period." description="Sales you void appear here for your records." />
          ) : q || status ? (
            <EmptyState icon={SearchX} title="No matching sales." description="Try a different search, status or date range." />
          ) : (
            <EmptyState
              icon={Receipt}
              title={range.preset === "today" ? "No sales yet today." : "No sales in this period."}
              description="Start by adding your first sale."
              action={
                <Link href="/" className="inline-flex h-11 items-center gap-2 rounded-xl bg-rose px-4 text-sm font-medium text-white">
                  <Plus className="size-4" /> Add Sale
                </Link>
              }
            />
          )
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <SalesTable sales={sales} tz={ctx.timezone} showDate={multiDay} canEdit={ctx.role === "OWNER"} />
            </div>
            <div className="divide-y divide-beige/50 p-2 lg:hidden">
              {sales.map((s) => (
                <SaleRow key={s.id} sale={s} tz={ctx.timezone} showDate={multiDay} canEdit={ctx.role === "OWNER"} />
              ))}
            </div>
            {sales.length === LIMIT && (
              <p className="border-t border-beige/60 px-5 py-3 text-center text-xs text-muted">
                Showing the latest {LIMIT} sales. Narrow the date range or search to see others.
              </p>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
