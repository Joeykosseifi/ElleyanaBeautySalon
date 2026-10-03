import { formatMoney } from "@/lib/domain/money";
import type { DailyPoint } from "@/lib/domain/reports";

/**
 * Day-by-day Service Value vs Collected — grouped bars on one shared axis.
 * Pure SVG/CSS (no chart library); each day has a hover/focus tooltip.
 */
export function DailyChart({ data }: { data: DailyPoint[] }) {
  const max = Math.max(1, ...data.flatMap((d) => [d.serviceValueCents, d.collectedCents]));
  const nice = niceMax(max);
  const ticks = [0, 0.5, 1].map((t) => Math.round(nice * t));
  const labelEvery = Math.ceil(data.length / 10);

  return (
    <figure>
      <div className="mb-3 flex flex-wrap gap-4 text-xs text-ink-soft" aria-hidden="true">
        <Legend color="bg-chart-2" label="Service Value" />
        <Legend color="bg-chart-1" label="Collected" />
      </div>
      <div className="flex gap-2">
        <div className="flex h-48 flex-col justify-between py-0 text-right text-[10px] text-muted tabular">
          {[...ticks].reverse().map((t) => (
            <span key={t} className="-translate-y-1/2 first:translate-y-0 last:translate-y-0">
              {formatMoney(t)}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-48">
            {ticks.map((t) => (
              <div key={t} className="absolute inset-x-0 border-t border-beige/70" style={{ bottom: `${(t / nice) * 100}%` }} />
            ))}
          </div>
          <div className="relative flex h-48 items-end gap-[2px]" role="list" aria-label="Daily service value and collected revenue">
            {data.map((d) => (
              <div key={d.day} role="listitem" tabIndex={0} className="group relative flex h-full min-w-0 flex-1 items-end justify-center gap-[2px] rounded-sm outline-none hover:bg-cream/70 focus-visible:bg-cream/70">
                <span className="w-full max-w-3 rounded-t-[4px] bg-chart-2" style={{ height: `${(d.serviceValueCents / nice) * 100}%` }} />
                <span className="w-full max-w-3 rounded-t-[4px] bg-chart-1" style={{ height: `${(d.collectedCents / nice) * 100}%` }} />
                <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded-lg bg-ink px-2.5 py-1.5 text-[11px] whitespace-nowrap text-white shadow-lift group-hover:block group-focus-visible:block">
                  <span className="block font-semibold">{dayLabel(d.day)}</span>
                  <span className="block">Service Value {formatMoney(d.serviceValueCents)}</span>
                  <span className="block">Collected {formatMoney(d.collectedCents)}</span>
                </span>
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex gap-[2px] text-[10px] text-muted">
            {data.map((d, i) => (
              <span key={d.day} className="min-w-0 flex-1 text-center">
                {i % labelEvery === 0 ? dayLabel(d.day, true) : ""}
              </span>
            ))}
          </div>
        </div>
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-xs font-medium text-muted">Show as table</summary>
        <table className="mt-2 w-full text-xs">
          <thead>
            <tr className="text-left text-muted">
              <th className="py-1 font-medium">Day</th>
              <th className="py-1 text-right font-medium">Service Value</th>
              <th className="py-1 text-right font-medium">Collected</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {data.map((d) => (
              <tr key={d.day} className="border-t border-beige/50">
                <td className="py-1">{dayLabel(d.day)}</td>
                <td className="py-1 text-right">{formatMoney(d.serviceValueCents)}</td>
                <td className="py-1 text-right">{formatMoney(d.collectedCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/** Horizontal bars for a single measure (e.g. collected by payment method). */
export function BarBreakdown({ rows, total }: { rows: { label: string; valueCents: number }[]; total: number }) {
  const max = Math.max(1, ...rows.map((r) => r.valueCents));
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label} className="group" title={`${r.label}: ${formatMoney(r.valueCents)}`}>
          <div className="mb-1 flex items-baseline justify-between text-sm">
            <span className="text-ink-soft">{r.label}</span>
            <span className="font-semibold tabular text-ink">
              {formatMoney(r.valueCents)}
              <span className="ml-1.5 text-xs font-normal text-muted">{total ? Math.round((r.valueCents / total) * 100) : 0}%</span>
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-cream">
            <div className="h-full rounded-full bg-chart-1 transition-opacity group-hover:opacity-80" style={{ width: `${(r.valueCents / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`size-2.5 rounded-sm ${color}`} />
      {label}
    </span>
  );
}

function niceMax(v: number) {
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / exp;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * exp;
}

function dayLabel(day: string, short = false) {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString("en-US", short ? { month: "numeric", day: "numeric", timeZone: "UTC" } : { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}
