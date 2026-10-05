import Link from "next/link";
import { ArrowLeft, ChevronRight, Scissors } from "lucide-react";
import { requireManager } from "@/server/auth-context";
import {
  CUSTOM_CATEGORY,
  getServiceActivity,
  getServiceActivityEntries,
  getServiceActivityOptions,
  type ActivityFilters as Filters,
} from "@/server/services/service-activity";
import { formatInZone } from "@/lib/domain/date-range";
import { formatMoney } from "@/lib/domain/money";
import { param, rangeFromParams, type SearchParams } from "@/lib/search-params";
import { PageHeader } from "@/components/layout/page-header";
import { DateRangeSelector } from "@/components/filters/date-range-selector";
import { LinkChips } from "@/components/filters/link-chips";
import { ReportsTabs } from "@/components/reports/reports-tabs";
import { ActivityFilters } from "@/components/reports/activity-filters";
import { MetricCard } from "@/components/reports/metric-card";
import { PaymentBadge } from "@/components/sales/payment-badge";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "Services Performed" };

const STATUS_FILTERS = [
  { value: undefined, label: "All" },
  { value: "PAID", label: "Paid" },
  { value: "PARTIAL", label: "Partial" },
  { value: "UNPAID", label: "Unpaid" },
] as const;
const ENTRY_LIMIT = 500;

export default async function ServicesPerformedPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireManager();
  const sp = await searchParams;
  const range = rangeFromParams(sp, ctx.timezone, "today");
  const options = await getServiceActivityOptions(ctx);

  // Only accept filter values that belong to this salon's menus; anything else is ignored.
  const rawStatus = param(sp, "status");
  const status = STATUS_FILTERS.find((s) => s.value && s.value === rawStatus)?.value ?? null;
  const rawCategory = param(sp, "category") ?? "";
  const categoryId = rawCategory === CUSTOM_CATEGORY || options.categories.some((c) => c.id === rawCategory) ? rawCategory : null;
  const rawEmployee = param(sp, "employee") ?? "";
  const employeeId = options.employees.some((e) => e.id === rawEmployee) ? rawEmployee : null;
  const rawService = (param(sp, "service") ?? "").slice(0, 300);
  const serviceKey = /^(svc|custom|name):./.test(rawService) ? rawService : null;

  const base: Filters = { start: range.start, end: range.end, categoryId, employeeId, paymentStatus: status };
  const all = await getServiceActivity(ctx, base);
  const selected = serviceKey
    ? (all.services.find((s) => s.key === serviceKey) ?? {
        key: serviceKey,
        name: options.services.find((o) => o.key === serviceKey)?.name ?? serviceKey.replace(/^\w+:/, ""),
        category: null,
        isCustom: serviceKey.startsWith("custom:"),
        count: 0,
      })
    : null;
  const [focus, entries] = selected
    ? await Promise.all([
        getServiceActivity(ctx, { ...base, serviceKey: selected.key }),
        getServiceActivityEntries(ctx, { ...base, serviceKey: selected.key }, ENTRY_LIMIT),
      ])
    : [all, null];

  const multiDay = range.fromDay !== range.toDay;
  const hrefWith = (changes: Record<string, string | null | undefined>) => {
    const next = new URLSearchParams();
    for (const k of ["range", "from", "to", "service", "category", "employee", "status"]) {
      const v = k in changes ? changes[k] : param(sp, k);
      if (v) next.set(k, v);
    }
    const q = next.toString();
    return `/reports/services${q ? `?${q}` : ""}`;
  };

  // Service menu: everything performed in this period, plus the rest of the catalog.
  const serviceOptions = [
    ...all.services.map((s) => ({ value: s.key, label: s.isCustom ? `${s.name} (custom)` : s.name })),
    ...options.services.filter((o) => !all.services.some((s) => s.key === o.key)).map((o) => ({ value: o.key, label: o.name })),
  ];
  if (selected && !serviceOptions.some((o) => o.value === selected.key)) serviceOptions.push({ value: selected.key, label: selected.name });
  const maxCount = Math.max(1, ...all.services.map((s) => s.count));

  return (
    <div>
      <PageHeader title="Services Performed" description="What was done in the salon, and how many times." />
      <ReportsTabs active="/reports/services" />

      <div className="mb-5 space-y-3">
        <DateRangeSelector
          value={range.preset}
          fromDay={range.fromDay}
          toDay={range.toDay}
          label={range.label}
          presets={["today", "yesterday", "week", "month", "custom"]}
        />
        <ActivityFilters
          service={selected?.key ?? ""}
          category={categoryId ?? ""}
          employee={employeeId ?? ""}
          services={serviceOptions}
          categories={[...options.categories.map((c) => ({ value: c.id, label: c.name })), { value: CUSTOM_CATEGORY, label: "Custom services" }]}
          employees={options.employees.map((e) => ({ value: e.id, label: e.active ? e.name : `${e.name} (inactive)` }))}
        />
        <LinkChips items={STATUS_FILTERS.map((f) => ({ href: hrefWith({ status: f.value ?? null }), label: f.label, active: status === (f.value ?? null) }))} />
      </div>

      <section aria-label="Summary" className="mb-5 grid grid-cols-3 gap-3">
        <MetricCard label="Services performed" value={focus.totalServices} tone="rose" />
        <MetricCard label="Clients served" value={focus.clientsServed} />
        <MetricCard label="Different services" value={focus.differentServices} />
      </section>

      {selected ? (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 sm:px-6">
            <div className="min-w-0">
              <Link href={hrefWith({ service: null })} className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-rose hover:underline">
                <ArrowLeft className="size-4" /> All services
              </Link>
              <h2 className="text-xl font-semibold text-ink">
                {selected.name}
                {selected.isCustom && <CustomTag />}
              </h2>
              {selected.category && <p className="text-sm text-muted">{selected.category}</p>}
            </div>
            <p className="text-right">
              <span className="block text-4xl font-semibold text-ink tabular">{focus.totalServices}</span>
              <span className="text-sm text-muted">performed</span>
            </p>
          </div>
          {entries && entries.length > 0 ? (
            <ul className="mt-4 divide-y divide-beige/60 border-t border-beige">
              {entries.map((e, i) => (
                <li key={`${e.saleId}-${i}`}>
                  <Link href={`/sales/${e.saleId}`} className="flex items-center gap-3 px-5 py-3 hover:bg-cream/60 sm:px-6">
                    <span className="w-20 shrink-0 text-sm font-medium text-ink tabular sm:w-28">
                      {multiDay && <span className="block text-xs font-normal text-muted">{formatInZone(e.performedAt, "MMM d", ctx.timezone)}</span>}
                      {formatInZone(e.performedAt, "h:mm a", ctx.timezone)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate font-medium ${e.isWalkIn ? "text-ink-soft" : "text-ink"}`}>{e.clientName}</span>
                      <span className="block truncate text-sm text-muted">{e.employeeName ?? "No employee"}</span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      {e.quantity > 1 && <span className="text-sm font-semibold text-ink">×{e.quantity}</span>}
                      <span className="hidden sm:inline">
                        <PaymentBadge status={e.paymentStatus} />
                      </span>
                      <span className="text-xs text-muted tabular">{formatMoney(e.lineTotalCents)}</span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-sand" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-6 text-sm text-muted sm:px-6">Not performed in this period{status || employeeId || categoryId ? " with these filters" : ""}.</p>
          )}
          {entries && entries.length === ENTRY_LIMIT && (
            <p className="border-t border-beige px-5 py-3 text-xs text-muted sm:px-6">Showing the first {ENTRY_LIMIT}. Choose a shorter period to see the rest.</p>
          )}
        </Card>
      ) : all.services.length === 0 ? (
        <Card>
          <EmptyState
            icon={Scissors}
            title={range.preset === "today" ? "No services performed yet today." : "No services performed in this period."}
            description={status || employeeId || categoryId ? "Try removing a filter or choosing another date range." : "Completed sales will appear here."}
          />
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Card className="overflow-hidden">
            <CardHeader title="By service" description="Tap a service to see who had it." />
            <ul className="mt-3 divide-y divide-beige/60 border-t border-beige">
              {all.services.map((s) => (
                <li key={s.key}>
                  <Link href={hrefWith({ service: s.key })} className="flex items-center gap-3 px-5 py-3.5 hover:bg-cream/60 sm:px-6">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-semibold text-ink">
                        {s.name}
                        {s.isCustom && <CustomTag />}
                      </span>
                      {s.category && <span className="block truncate text-xs text-muted">{s.category}</span>}
                      <span className="mt-1.5 block h-1.5 rounded-full bg-cream" aria-hidden>
                        <span className="block h-full rounded-full bg-rose/70" style={{ width: `${Math.max(4, (s.count / maxCount) * 100)}%` }} />
                      </span>
                    </span>
                    <span className="w-20 shrink-0 text-right">
                      <span className="block text-2xl leading-tight font-semibold text-ink tabular">{s.count}</span>
                      <span className="text-xs text-muted">performed</span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-sand" />
                  </Link>
                </li>
              ))}
            </ul>
            <p className="flex justify-between border-t border-beige bg-cream/40 px-5 py-3 text-sm font-semibold text-ink sm:px-6">
              <span>Total services performed</span>
              <span className="tabular">{all.totalServices}</span>
            </p>
          </Card>

          <Card className="h-fit overflow-hidden">
            <CardHeader title="By employee" description="Services each person performed." />
            <ul className="mt-3 divide-y divide-beige/60 border-t border-beige">
              {all.employees.map((e) => (
                <li key={e.employeeId ?? "none"}>
                  <Link
                    href={e.employeeId ? hrefWith({ employee: e.employeeId }) : hrefWith({})}
                    className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-cream/60 sm:px-6"
                  >
                    <span className={`truncate font-medium ${e.employeeId ? "text-ink" : "text-muted"}`}>{e.name}</span>
                    <span className="shrink-0 text-right text-sm text-muted">
                      <span className="text-lg font-semibold text-ink tabular">{e.count}</span> performed
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      <p className="mt-5 text-xs text-muted">
        Every service on a sale counts once (a quantity of 2 counts twice). Clients served counts each registered client once plus each walk-in
        visit. Voided sales are never included.
      </p>
    </div>
  );
}

function CustomTag() {
  return <span className="ml-2 rounded-full bg-gold-soft px-1.5 py-0.5 align-middle text-[10px] font-semibold text-gold uppercase">Custom</span>;
}
