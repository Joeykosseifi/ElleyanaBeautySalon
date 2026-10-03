"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Footprints, Phone, Search, UserPlus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/domain/money";
import { clientDisplayName } from "@/lib/domain/labels";
import { searchClientsAction } from "@/server/actions/sales";
import { Input } from "@/components/ui/form";
import { Spinner } from "@/components/ui/spinner";
import type { ClientChoice, ClientSummary, NewClientDraft } from "./types";
import { safeAction } from "@/lib/safe-action";

const emptyDraft: NewClientDraft = { firstName: "", lastName: "", phone: "", email: "", notes: "" };

export function ClientSelector({
  value,
  onChange,
  needsIdentity,
}: {
  value: ClientChoice;
  onChange: (v: ClientChoice) => void;
  /** True when the sale is unpaid / partial — a walk-in must be identified. */
  needsIdentity: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ClientSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [showMore, setShowMore] = useState(false);
  const requestId = useRef(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const runSearch = useCallback(async (q: string) => {
    const id = ++requestId.current;
    setLoading(true);
    const res = await safeAction(() => searchClientsAction(q));
    if (id !== requestId.current) return; // a newer search started
    setLoading(false);
    setResults(res.ok ? res.data : []);
    setActive(0);
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => runSearch(query), query ? 180 : 0);
    return () => clearTimeout(t);
  }, [query, open, runSearch]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const select = (client: ClientSummary) => {
    onChange({ kind: "existing", client });
    setOpen(false);
    setQuery("");
  };

  const startNew = (seed = query.trim()) => {
    const looksLikePhone = /^[+\d][\d\s()-]{2,}$/.test(seed);
    const [first, ...rest] = looksLikePhone ? [""] : seed.split(/\s+/);
    onChange({
      kind: "new",
      draft: { ...emptyDraft, firstName: first ?? "", lastName: rest.join(" "), phone: looksLikePhone ? seed : "" },
    });
    setOpen(false);
    setQuery("");
  };

  // ---- Selected states -----------------------------------------------------
  if (value.kind === "existing") {
    const c = value.client;
    return (
      <div className="flex items-center gap-3 rounded-2xl border-2 border-rose/60 bg-blush/50 p-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white font-display text-lg font-bold text-rose">
          {c.firstName.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-ink">{clientDisplayName(c)}</p>
          <p className="flex flex-wrap items-center gap-x-3 text-sm text-muted">
            {c.phone && <span className="inline-flex items-center gap-1"><Phone className="size-3" />{c.phone}</span>}
            {c.outstandingCents ? (
              <span className="font-medium text-unpaid">Owes {formatMoney(c.outstandingCents)}</span>
            ) : null}
          </p>
        </div>
        <ChangeButton onClick={() => onChange({ kind: "none" })} />
      </div>
    );
  }

  if (value.kind === "walkin") {
    return (
      <div className="space-y-2">
        <div className={cn("flex items-center gap-3 rounded-2xl border-2 p-3", needsIdentity ? "border-partial/50 bg-partial-bg/60" : "border-beige bg-cream/60")}>
          <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white text-ink-soft">
            <Footprints className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-ink">Walk-in Client</p>
            <p className="text-sm text-muted">No client profile</p>
          </div>
          <ChangeButton onClick={() => onChange({ kind: "none" })} />
        </div>
        {needsIdentity && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-partial-bg px-3 py-2 text-sm text-partial" role="alert">
            <span>Unpaid and partial sales need the client&apos;s name so you know who owes money.</span>
            <button type="button" onClick={() => startNew("")} className="font-semibold underline underline-offset-2">
              Add client name
            </button>
          </div>
        )}
      </div>
    );
  }

  if (value.kind === "new") {
    const d = value.draft;
    const set = (patch: Partial<NewClientDraft>) => onChange({ kind: "new", draft: { ...d, ...patch } });
    return (
      <div className="space-y-3 rounded-2xl border-2 border-rose/40 bg-blush/30 p-3.5">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2 text-sm font-semibold text-rose-dark">
            <UserPlus className="size-4" /> New client
          </p>
          <button type="button" onClick={() => onChange({ kind: "none" })} className="text-sm text-muted hover:text-ink">
            Cancel
          </button>
        </div>
        <div className="grid gap-2.5 sm:grid-cols-2">
          <Input
            autoFocus
            placeholder="Client name *"
            aria-label="Client name"
            value={d.firstName}
            onChange={(e) => set({ firstName: e.target.value })}
            maxLength={80}
          />
          <Input
            placeholder="Last name"
            aria-label="Last name"
            value={d.lastName}
            onChange={(e) => set({ lastName: e.target.value })}
            maxLength={80}
          />
          <Input
            placeholder={needsIdentity ? "Phone (recommended)" : "Phone"}
            aria-label="Phone"
            type="tel"
            inputMode="tel"
            value={d.phone}
            onChange={(e) => set({ phone: e.target.value })}
            maxLength={30}
            className="sm:col-span-2"
          />
          {showMore ? (
            <>
              <Input
                placeholder="Email"
                aria-label="Email"
                type="email"
                value={d.email}
                onChange={(e) => set({ email: e.target.value })}
                className="sm:col-span-2"
              />
              <Input
                placeholder="Notes"
                aria-label="Notes"
                value={d.notes}
                onChange={(e) => set({ notes: e.target.value })}
                className="sm:col-span-2"
              />
            </>
          ) : (
            <button type="button" onClick={() => setShowMore(true)} className="text-left text-sm font-medium text-rose sm:col-span-2">
              + Email & notes
            </button>
          )}
        </div>
      </div>
    );
  }

  // ---- Search state --------------------------------------------------------
  const showCreate = query.trim().length > 0;
  return (
    <div className="space-y-2.5" ref={boxRef}>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted" />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (results[active]) select(results[active]);
              else if (showCreate) startNew();
            } else if (e.key === "Escape") setOpen(false);
          }}
          placeholder="Search name or phone…"
          aria-label="Search clients"
          role="combobox"
          aria-expanded={open}
          aria-controls="client-results"
          aria-autocomplete="list"
          className="h-12 pl-11 text-base"
        />
        {loading && <Spinner className="absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-muted" />}

        {open && (
          <div
            id="client-results"
            role="listbox"
            className="absolute inset-x-0 top-full z-20 mt-1.5 max-h-80 overflow-y-auto rounded-2xl border border-beige bg-white p-1.5 shadow-lift"
          >
            {!query && results.length > 0 && <p className="px-3 pt-1.5 pb-1 text-xs font-medium text-muted uppercase">Recent clients</p>}
            {results.map((c, i) => (
              <button
                key={c.id}
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => select(c)}
                className={cn("flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left", i === active && "bg-cream")}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-ink">{clientDisplayName(c)}</span>
                  {c.phone && <span className="block text-sm text-muted">{c.phone}</span>}
                </span>
                {c.outstandingCents ? (
                  <span className="shrink-0 text-xs font-semibold text-unpaid">Owes {formatMoney(c.outstandingCents)}</span>
                ) : null}
              </button>
            ))}
            {!loading && results.length === 0 && query && (
              <p className="px-3 py-2.5 text-sm text-muted">No clients match &ldquo;{query}&rdquo;.</p>
            )}
            {showCreate && (
              <button
                type="button"
                onClick={() => startNew()}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left font-medium text-rose hover:bg-blush/60"
              >
                <UserPlus className="size-4" /> Add &ldquo;{query.trim()}&rdquo; as new client
              </button>
            )}
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onChange({ kind: "walkin" })}
          className="flex h-11 items-center justify-center gap-2 rounded-xl border border-beige bg-white text-sm font-medium text-ink-soft hover:bg-cream"
        >
          <Footprints className="size-4" /> Walk-in Client
        </button>
        <button
          type="button"
          onClick={() => startNew()}
          className="flex h-11 items-center justify-center gap-2 rounded-xl border border-beige bg-white text-sm font-medium text-ink-soft hover:bg-cream"
        >
          <UserPlus className="size-4" /> New Client
        </button>
      </div>
    </div>
  );
}

function ChangeButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium text-ink-soft hover:bg-white"
      aria-label="Change client"
    >
      <X className="size-4" /> Change
    </button>
  );
}
