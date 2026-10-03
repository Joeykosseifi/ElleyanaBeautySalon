import Link from "next/link";
import { ArrowLeft, Wallet } from "lucide-react";
import { requireAppContext } from "@/server/auth-context";
import { listOutstanding } from "@/server/services/clients";
import { formatMoney } from "@/lib/domain/money";
import { PageHeader } from "@/components/layout/page-header";
import { ClientBalanceCard } from "@/components/clients/client-balance-card";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricCard } from "@/components/reports/metric-card";

export const metadata = { title: "Outstanding Payments" };

export default async function OutstandingPage() {
  const ctx = await requireAppContext();
  const { totalCents, clients } = await listOutstanding(ctx);
  const salesCount = clients.reduce((n, c) => n + c.sales.length, 0);

  return (
    <div>
      <Link href="/clients" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Clients
      </Link>
      <PageHeader title="Outstanding Payments" description="Everyone who still owes money, largest balance first." />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3">
        <MetricCard label="Total Outstanding" value={formatMoney(totalCents)} tone={totalCents ? "unpaid" : "default"} />
        <MetricCard label="Clients" value={clients.length} />
        <MetricCard label="Unpaid / Partial Sales" value={salesCount} className="max-md:col-span-2" />
      </div>

      {clients.length === 0 ? (
        <Card>
          <EmptyState icon={Wallet} title="All client balances are paid." description="Nothing is outstanding right now." />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {clients.map((c) => (
            <ClientBalanceCard key={c.client.id} entry={c} tz={ctx.timezone} />
          ))}
        </div>
      )}
    </div>
  );
}
