import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { formatMoney } from "@/lib/domain/money";
import { clientDisplayName } from "@/lib/domain/labels";
import { fmtShortDate } from "@/lib/format";
import type { OutstandingClient } from "@/server/services/clients";

/** One client who owes money, with their unpaid / partial sales. */
export function ClientBalanceCard({ entry, tz }: { entry: OutstandingClient; tz: string }) {
  const isWalkIn = entry.client.id === "walk-in";
  return (
    <div className="rounded-2xl border border-beige/70 bg-white p-4 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {isWalkIn ? (
            <p className="font-semibold text-ink">Walk-in clients</p>
          ) : (
            <Link href={`/clients/${entry.client.id}`} className="font-semibold text-ink hover:text-rose-dark">
              {clientDisplayName(entry.client)}
            </Link>
          )}
          {entry.client.phone && (
            <a href={`tel:${entry.client.phone}`} className="block text-sm text-muted hover:text-ink">
              {entry.client.phone}
            </a>
          )}
        </div>
        <p className="text-xl font-semibold text-unpaid tabular">{formatMoney(entry.outstandingCents)}</p>
      </div>
      <ul className="mt-3 space-y-1">
        {entry.sales.map((s) => (
          <li key={s.id}>
            <Link href={`/sales/${s.id}`} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-cream">
              <span className="text-ink-soft">
                Sale #{s.number} · {fmtShortDate(s.createdAt, tz)}
              </span>
              <span className="flex items-center gap-1 tabular">
                <span className="text-muted">of {formatMoney(s.finalTotalCents)}</span>
                <span className="font-medium text-unpaid">{formatMoney(s.remainingCents)}</span>
                <ChevronRight className="size-4 text-sand" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
