"use client";

import { useState } from "react";
import Link from "next/link";
import { Receipt } from "lucide-react";
import { formatMoney } from "@/lib/domain/money";
import type { TodaySnapshot } from "@/server/services/home";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { QuickAddSale } from "./quick-add-sale";
import { SaleRow } from "./sale-row";
import type { QuickCategory, QuickEmployee } from "./types";

/**
 * Home screen body. The Today panel is client state seeded by the server render and
 * replaced by the snapshot returned from Complete Sale — so saving a sale updates the
 * totals and recent transactions without re-rendering or re-fetching the page.
 */
export function HomeLive({
  categories,
  employees,
  initialToday,
  tz,
}: {
  categories: QuickCategory[];
  employees: QuickEmployee[];
  initialToday: TodaySnapshot;
  tz: string;
}) {
  const [today, setToday] = useState(initialToday);
  // A fresh server render (e.g. navigating back to Home) replaces the local snapshot.
  const [seed, setSeed] = useState(initialToday);
  if (seed !== initialToday) {
    setSeed(initialToday);
    setToday(initialToday);
  }

  return (
    <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px] 2xl:grid-cols-[minmax(0,1fr)_420px]">
      <QuickAddSale categories={categories} employees={employees} onSaved={(t) => t && setToday(t)} />

      <aside className="space-y-5 xl:sticky xl:top-8" aria-label="Today">
        <Card>
          <CardHeader title="Today’s Summary" description="Updates after every sale." />
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-b-3xl px-5 pt-3 pb-5 sm:grid-cols-3 sm:px-6 xl:grid-cols-2" data-testid="today-summary">
            <Stat label="Service Value" value={formatMoney(today.serviceValueCents)} />
            <Stat label="Collected" value={formatMoney(today.collectedRevenueCents)} tone="text-paid" />
            <Stat label="Outstanding" value={formatMoney(today.outstandingCents)} tone={today.outstandingCents ? "text-unpaid" : undefined} />
            <Stat label="Clients" value={String(today.clientsCount)} />
            <Stat label="Services" value={String(today.servicesCount)} />
            <Stat label="Sales" value={String(today.salesCount)} />
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
            {today.recent.length === 0 ? (
              <EmptyState icon={Receipt} title="No sales yet today." description="Start by adding your first sale." className="py-8" />
            ) : (
              today.recent.map((s) => <SaleRow key={s.id} sale={s} tz={tz} />)
            )}
          </div>
        </Card>
      </aside>
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
