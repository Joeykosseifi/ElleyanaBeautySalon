"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { CalendarDays } from "lucide-react";
import { DATE_PRESETS, type DatePreset } from "@/lib/domain/date-range";
import { Chip } from "@/components/ui/chip";
import { Spinner } from "@/components/ui/spinner";

export function DateRangeSelector({
  value,
  fromDay,
  toDay,
  label,
  presets = DATE_PRESETS.map((p) => p.value),
}: {
  value: DatePreset;
  fromDay: string;
  toDay: string;
  label: string;
  presets?: DatePreset[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [from, setFrom] = useState(fromDay);
  const [to, setTo] = useState(toDay);

  const navigate = (next: Record<string, string | null>) => {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null) sp.delete(k);
      else sp.set(k, v);
    }
    startTransition(() => router.replace(`${pathname}?${sp.toString()}`, { scroll: false }));
  };

  return (
    <div className="space-y-2.5">
      <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1 scrollbar-none" role="group" aria-label="Date range">
        {DATE_PRESETS.filter((p) => presets.includes(p.value)).map((p) => (
          <Chip
            key={p.value}
            size="sm"
            selected={value === p.value}
            onClick={() =>
              navigate(p.value === "custom" ? { range: "custom", from, to } : { range: p.value, from: null, to: null })
            }
          >
            {p.label}
          </Chip>
        ))}
        {pending && <Spinner className="size-4 shrink-0 text-muted" />}
      </div>
      {value === "custom" && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            navigate({ range: "custom", from, to });
          }}
        >
          <label className="text-xs text-muted">
            From
            <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="mt-1 block h-10 rounded-xl border border-beige bg-white px-3 text-sm text-ink" />
          </label>
          <label className="text-xs text-muted">
            To
            <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="mt-1 block h-10 rounded-xl border border-beige bg-white px-3 text-sm text-ink" />
          </label>
          <button type="submit" className="h-10 rounded-xl bg-ink px-4 text-sm font-medium text-white">
            Apply
          </button>
        </form>
      )}
      <p className="flex items-center gap-1.5 text-sm text-muted">
        <CalendarDays className="size-4" /> {label}
      </p>
    </div>
  );
}
