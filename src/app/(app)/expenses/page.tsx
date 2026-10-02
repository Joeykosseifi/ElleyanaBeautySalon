import { Paperclip, Wallet } from "lucide-react";
import { requireManager } from "@/server/auth-context";
import { listExpenses } from "@/server/services/expenses";
import { dayKey } from "@/lib/domain/date-range";
import { formatMoney } from "@/lib/domain/money";
import { EXPENSE_CATEGORY_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/domain/labels";
import { fmtShortDate } from "@/lib/format";
import { rangeFromParams, type SearchParams } from "@/lib/search-params";
import { PageHeader } from "@/components/layout/page-header";
import { DateRangeSelector } from "@/components/filters/date-range-selector";
import { AddExpenseButton, ExpenseActions } from "@/components/expenses/expense-form";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricCard } from "@/components/reports/metric-card";

export const metadata = { title: "Expenses" };

export default async function ExpensesPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireManager();
  const range = rangeFromParams(await searchParams, ctx.timezone, "month");
  const expenses = await listExpenses(ctx, range);
  const total = expenses.reduce((s, e) => s + e.amountCents, 0);
  const today = dayKey(new Date(), ctx.timezone);
  const byCategory = Object.entries(
    expenses.reduce<Record<string, number>>((acc, e) => ({ ...acc, [e.category]: (acc[e.category] ?? 0) + e.amountCents }), {}),
  ).sort((a, b) => b[1] - a[1]);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Expenses" description="Rent, products, bills and other running costs." actions={<AddExpenseButton today={today} />} />
      <div className="mb-5">
        <DateRangeSelector value={range.preset} fromDay={range.fromDay} toDay={range.toDay} label={range.label} />
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard label="Total Expenses" value={formatMoney(total)} className="col-span-2 md:col-span-1" />
        {byCategory.slice(0, 3).map(([cat, cents]) => (
          <MetricCard key={cat} size="sm" label={EXPENSE_CATEGORY_LABELS[cat as keyof typeof EXPENSE_CATEGORY_LABELS]} value={formatMoney(cents)} />
        ))}
      </div>

      <Card className="overflow-hidden">
        {expenses.length === 0 ? (
          <EmptyState icon={Wallet} title="No expenses in this period." description="Add rent, product purchases and bills to see your real profit." action={<AddExpenseButton today={today} />} />
        ) : (
          <ul className="divide-y divide-beige/60">
            {expenses.map((e) => (
              <li key={e.id} className="flex items-center gap-3 px-4 py-3 sm:px-6">
                <div className="w-14 shrink-0 text-sm text-muted">{fmtShortDate(e.date, ctx.timezone)}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ink">{e.description}</p>
                  <p className="truncate text-sm text-muted">
                    {EXPENSE_CATEGORY_LABELS[e.category]}
                    {e.paymentMethod ? ` · ${PAYMENT_METHOD_LABELS[e.paymentMethod]}` : ""}
                    {e.notes ? ` · ${e.notes}` : ""}
                  </p>
                </div>
                {e.receiptUrl && (
                  <a href={e.receiptUrl} target="_blank" rel="noreferrer" className="text-muted hover:text-rose" aria-label="View receipt" title="View receipt">
                    <Paperclip className="size-4" />
                  </a>
                )}
                <span className="font-semibold tabular">{formatMoney(e.amountCents)}</span>
                <ExpenseActions
                  today={today}
                  expense={{
                    id: e.id,
                    category: e.category,
                    description: e.description,
                    amountCents: e.amountCents,
                    day: dayKey(e.date, ctx.timezone),
                    paymentMethod: e.paymentMethod,
                    notes: e.notes,
                    receiptUrl: e.receiptUrl,
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
