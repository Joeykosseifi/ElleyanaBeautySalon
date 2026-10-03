import Link from "next/link";
import { ChevronRight, SearchX, Users, Wallet } from "lucide-react";
import { requireAppContext } from "@/server/auth-context";
import { listClients } from "@/server/services/clients";
import { getTotalOutstanding } from "@/server/services/reports";
import { formatMoney } from "@/lib/domain/money";
import { clientDisplayName } from "@/lib/domain/labels";
import { fmtShortDate } from "@/lib/format";
import { param, type SearchParams } from "@/lib/search-params";
import { PageHeader } from "@/components/layout/page-header";
import { SearchInput } from "@/components/filters/search-input";
import { LinkChips } from "@/components/filters/link-chips";
import { ClientFormButton } from "@/components/clients/client-form";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "Clients" };

export default async function ClientsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireAppContext();
  const sp = await searchParams;
  const q = (param(sp, "q") ?? "").slice(0, 100);
  const owing = param(sp, "filter") === "owing";
  const [all, totalOutstanding] = await Promise.all([listClients(ctx, { q }), getTotalOutstanding(ctx)]);
  const clients = owing ? all.filter((c) => c.outstandingCents > 0).sort((a, b) => b.outstandingCents - a.outstandingCents) : all;
  const qs = q ? `&q=${encodeURIComponent(q)}` : "";

  return (
    <div>
      <PageHeader title="Clients" description="Visit history and balances for everyone who comes in." actions={<ClientFormButton />} />

      <Link
        href="/clients/outstanding"
        className="mb-5 flex items-center justify-between gap-4 rounded-2xl border border-unpaid/15 bg-unpaid-bg/60 px-5 py-4 transition-colors hover:bg-unpaid-bg"
      >
        <span className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-full bg-white text-unpaid">
            <Wallet className="size-5" />
          </span>
          <span>
            <span className="block text-sm font-medium text-ink-soft">Outstanding Payments</span>
            <span className="block text-2xl font-semibold text-unpaid tabular">{formatMoney(totalOutstanding)}</span>
          </span>
        </span>
        <ChevronRight className="size-5 text-unpaid" />
      </Link>

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
        <SearchInput placeholder="Search by name or phone…" className="md:max-w-md md:flex-1" />
        <LinkChips
          items={[
            { href: `/clients?${qs.slice(1)}`, label: "All clients", active: !owing },
            { href: `/clients?filter=owing${qs}`, label: "Owing money", active: owing },
          ]}
        />
      </div>

      <Card className="overflow-hidden">
        {clients.length === 0 ? (
          q ? (
            <EmptyState icon={SearchX} title="No clients found." description={`Nobody matches “${q}”.`} />
          ) : owing ? (
            <EmptyState icon={Wallet} title="All client balances are paid." description="Nobody owes the salon money right now." />
          ) : (
            <EmptyState icon={Users} title="No clients yet." description="Clients are added from Quick Add Sale or with the New Client button." />
          )
        ) : (
          <>
            <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_1fr_0.8fr_1fr_20px] gap-3 border-b border-beige px-5 py-3 text-xs font-medium tracking-wide text-muted uppercase md:grid">
              <span>Client</span>
              <span>Phone</span>
              <span>Last visit</span>
              <span className="text-right">Visits</span>
              <span className="text-right">Outstanding</span>
              <span />
            </div>
            <ul className="divide-y divide-beige/60">
              {clients.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/clients/${c.id}`}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 px-5 py-3.5 hover:bg-cream/60 md:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_1fr_0.8fr_1fr_20px]"
                  >
                    <span className="truncate font-medium text-ink">{clientDisplayName(c)}</span>
                    <span className="truncate text-sm text-muted max-md:order-3">{c.phone ?? "—"}</span>
                    <span className="text-sm text-ink-soft max-md:hidden">{c.lastVisit ? fmtShortDate(c.lastVisit, ctx.timezone) : "—"}</span>
                    <span className="text-right text-sm text-ink-soft tabular max-md:order-4 max-md:text-xs max-md:text-muted">
                      {c.visits}
                      <span className="md:hidden"> visits{c.lastVisit ? ` · last ${fmtShortDate(c.lastVisit, ctx.timezone)}` : ""}</span>
                    </span>
                    <span className={`text-right font-semibold tabular max-md:order-2 ${c.outstandingCents ? "text-unpaid" : "text-muted"}`}>
                      {formatMoney(c.outstandingCents)}
                    </span>
                    <ChevronRight className="size-4 text-sand max-md:hidden" />
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}
