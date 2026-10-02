"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, StickyNote } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney, toCents } from "@/lib/domain/money";
import { calculateRemaining, calculateSaleTotals, type PaymentStatus } from "@/lib/domain/sale-calculations";
import type { PaymentMethod } from "@/lib/domain/reports";
import { createSaleAction } from "@/server/actions/sales";
import type { CreateSaleInput } from "@/lib/validation/sale";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { MoneyInput, Textarea } from "@/components/ui/form";
import { Chip } from "@/components/ui/chip";
import { ClientSelector } from "./client-selector";
import { EmployeeSelector } from "./employee-selector";
import { ServiceCard } from "./service-card";
import { OrderSummary, type DiscountDraft } from "./order-summary";
import { PaymentStatusSelector } from "./payment-status-selector";
import { PaymentMethodSelector } from "./payment-method-selector";
import type { ClientChoice, QuickCategory, QuickEmployee, QuickService } from "./types";

const LAST_EMPLOYEE_KEY = "salonflow:last-employee";
const NO_DISCOUNT: DiscountDraft = { open: false, type: "FIXED", input: "" };

type Errors = Partial<Record<"client" | "services" | "amount" | "method" | "discount", string>>;

export function QuickAddSale({ categories, employees }: { categories: QuickCategory[]; employees: QuickEmployee[] }) {
  const router = useRouter();
  const toast = useToast();
  const topRef = useRef<HTMLDivElement>(null);
  const [isPending, startTransition] = useTransition();

  const tabs = categories.filter((c) => c.services.length > 0);
  const serviceById = useMemo(() => {
    const m = new Map<string, QuickService>();
    for (const c of categories) for (const s of c.services) m.set(s.id, s);
    return m;
  }, [categories]);

  const [client, setClient] = useState<ClientChoice>({ kind: "none" });
  const [employeeId, setEmployeeId] = useState<string | null>(employees.length === 1 ? employees[0].id : null);
  const [tab, setTab] = useState(tabs[0]?.id ?? "");
  const [selected, setSelected] = useState<{ id: string; qty: number }[]>([]);
  const [discount, setDiscount] = useState<DiscountDraft>(NO_DISCOUNT);
  const [status, setStatus] = useState<PaymentStatus>("PAID");
  const [amountInput, setAmountInput] = useState("");
  const [method, setMethod] = useState<PaymentMethod | null>("CASH");
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);

  // Remember the last employee used on this device.
  useEffect(() => {
    if (employees.length === 1) return;
    try {
      const saved = localStorage.getItem(LAST_EMPLOYEE_KEY);
      if (saved && employees.some((e) => e.id === saved)) setEmployeeId(saved);
    } catch {
      /* storage unavailable */
    }
  }, [employees]);
  const chooseEmployee = (id: string | null) => {
    setEmployeeId(id);
    try {
      if (id) localStorage.setItem(LAST_EMPLOYEE_KEY, id);
    } catch {
      /* ignore */
    }
  };

  const lines = selected.flatMap((s) => {
    const service = serviceById.get(s.id);
    return service ? [{ service, quantity: s.qty }] : [];
  });

  // Discount input → domain discount
  const discountRaw = discount.open && discount.input.trim() ? Number(discount.input) : 0;
  const discountInvalid =
    discount.open && discount.input.trim() !== "" && (!Number.isFinite(discountRaw) || discountRaw < 0 || (discount.type === "PERCENTAGE" && discountRaw > 100));
  // FIXED: dollars → cents. PERCENTAGE: percent → basis points. Both are ×100.
  const discountValue = discountInvalid ? 0 : Math.round(discountRaw * 100);
  const totals = calculateSaleTotals(
    lines.map((l) => ({ unitPriceCents: l.service.priceCents, quantity: l.quantity })),
    discountValue > 0 ? { type: discount.type, value: discountValue } : null,
  );

  const partialCents = toCents(amountInput);
  const amountPaidCents = status === "PAID" ? totals.finalTotalCents : status === "UNPAID" ? 0 : Number.isNaN(partialCents) ? 0 : partialCents;
  const remainingCents = calculateRemaining(totals.finalTotalCents, amountPaidCents);
  const needsIdentity = status !== "PAID";
  const needsMethod = status !== "UNPAID" && totals.finalTotalCents > 0;

  // ---- Validation (mirrors the server; the server re-checks everything) ----
  const errors: Errors = {};
  if (client.kind === "none") errors.client = "Choose a client, or tap Walk-in Client.";
  else if (client.kind === "new" && !client.draft.firstName.trim()) errors.client = "Enter the client's name.";
  else if (client.kind === "walkin" && needsIdentity) errors.client = "Add the client's name for unpaid or partial sales.";
  if (lines.length === 0) errors.services = "Tap at least one service.";
  if (discountInvalid) errors.discount = "Enter a valid discount.";
  if (status === "PARTIAL") {
    if (Number.isNaN(partialCents) || partialCents <= 0) errors.amount = "Enter the amount the client paid.";
    else if (partialCents >= totals.finalTotalCents) errors.amount = "Partial payment must be less than the total — choose Paid instead.";
  }
  if (needsMethod && !method) errors.method = "Choose a payment method.";
  const firstError = Object.values(errors)[0];

  const toggleService = (id: string) =>
    setSelected((list) => (list.some((s) => s.id === id) ? list.filter((s) => s.id !== id) : [...list, { id, qty: 1 }]));
  const setQty = (id: string, qty: number) => setSelected((list) => list.map((s) => (s.id === id ? { ...s, qty } : s)));
  const remove = (id: string) => setSelected((list) => list.filter((s) => s.id !== id));

  const reset = () => {
    setClient({ kind: "none" });
    setSelected([]);
    setDiscount(NO_DISCOUNT);
    setStatus("PAID");
    setAmountInput("");
    setMethod("CASH");
    setNotes("");
    setNotesOpen(false);
    setSubmitted(false);
  };

  const submit = () => {
    setSubmitted(true);
    if (firstError || isPending) {
      if (firstError) toast({ tone: "error", title: firstError });
      return;
    }
    const input: CreateSaleInput = {
      clientId: client.kind === "existing" ? client.client.id : null,
      newClient:
        client.kind === "new"
          ? {
              firstName: client.draft.firstName,
              lastName: client.draft.lastName || null,
              phone: client.draft.phone || null,
              email: client.draft.email || null,
              notes: client.draft.notes || null,
            }
          : null,
      employeeId,
      items: selected.map((s) => ({ serviceId: s.id, quantity: s.qty })),
      discount: discountValue > 0 ? { type: discount.type, value: discountValue } : null,
      paymentStatus: status,
      amountPaidCents: status === "PARTIAL" ? partialCents : null,
      paymentMethod: needsMethod ? method : null,
      notes: notes.trim() || null,
    };
    startTransition(async () => {
      const res = await createSaleAction(input);
      if (!res.ok) {
        toast({ tone: "error", title: "Sale not saved", description: res.error });
        return;
      }
      const s = res.data;
      toast({
        tone: "success",
        title: "Sale saved successfully.",
        description:
          s.paymentStatus === "UNPAID"
            ? `${formatMoney(s.remainingCents)} added to outstanding balances.`
            : s.paymentStatus === "PARTIAL"
              ? `${formatMoney(s.remainingCents)} remaining for ${s.clientName}.`
              : `${s.clientName} · ${formatMoney(s.finalTotalCents)} · Sale #${s.number}`,
      });
      reset();
      topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      router.refresh();
    });
  };

  const showErr = (k: keyof Errors) => (submitted ? errors[k] : undefined);
  const activeServices = tabs.find((t) => t.id === tab)?.services ?? [];
  const countInTab = (c: QuickCategory) => c.services.reduce((n, s) => n + (selected.find((x) => x.id === s.id)?.qty ?? 0), 0);

  return (
    <section ref={topRef} aria-labelledby="quick-add-title" className="min-w-0 scroll-mt-20 rounded-3xl border border-beige/70 bg-white shadow-soft">
      <div className="px-4 pt-5 sm:px-6">
        <h2 id="quick-add-title" className="font-display text-2xl font-bold text-ink sm:text-3xl">
          Quick Add Sale
        </h2>
        <p className="text-sm text-muted">Tap the services completed for this client.</p>
      </div>

      <div className="space-y-6 px-4 py-5 sm:px-6">
        <Step n={1} title="Client" error={showErr("client")}>
          <ClientSelector value={client} onChange={setClient} needsIdentity={needsIdentity} />
        </Step>

        <Step n={2} title="Employee">
          <EmployeeSelector employees={employees} value={employeeId} onChange={chooseEmployee} />
        </Step>

        <Step n={3} title="Services" error={showErr("services")}>
          {tabs.length === 0 ? (
            <p className="text-sm text-muted">No active services yet. Add them under Services.</p>
          ) : (
            <>
              <div className="-mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-none" role="tablist" aria-label="Service categories">
                {tabs.map((c) => {
                  const n = countInTab(c);
                  return (
                    <Chip key={c.id} role="tab" aria-selected={tab === c.id} selected={tab === c.id} onClick={() => setTab(c.id)}>
                      {c.name}
                      {n > 0 && (
                        <span className={cn("rounded-full px-1.5 text-xs", tab === c.id ? "bg-white/25" : "bg-blush text-rose-dark")}>{n}</span>
                      )}
                    </Chip>
                  );
                })}
              </div>
              <div role="tabpanel" className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 2xl:grid-cols-4">
                {activeServices.map((s) => (
                  <ServiceCard
                    key={s.id}
                    service={s}
                    quantity={selected.find((x) => x.id === s.id)?.qty ?? 0}
                    onToggle={() => toggleService(s.id)}
                  />
                ))}
              </div>
            </>
          )}
        </Step>

        <Step n={4} title="Order Summary" error={showErr("discount")}>
          <OrderSummary
            lines={lines}
            totals={totals}
            discount={discount}
            onDiscountChange={setDiscount}
            onQuantity={setQty}
            onRemove={remove}
            discountInvalid={discountInvalid}
          />
        </Step>

        <Step n={5} title="Payment Status">
          <PaymentStatusSelector
            value={status}
            onChange={setStatus}
          />
          <div className="mt-3 grid grid-cols-2 gap-3 rounded-2xl bg-cream/60 p-3 text-sm sm:grid-cols-3">
            <div className={cn(status === "PARTIAL" && "col-span-2 sm:col-span-1")}>
              <p className="mb-1 text-xs font-medium text-muted uppercase">Amount paid</p>
              {status === "PARTIAL" ? (
                <MoneyInput
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  placeholder="0"
                  aria-label="Amount paid"
                  aria-invalid={Boolean(showErr("amount"))}
                  className="h-10 bg-white text-base font-semibold"
                />
              ) : (
                <p className="text-lg font-semibold tabular">{formatMoney(amountPaidCents)}</p>
              )}
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-muted uppercase">Total</p>
              <p className="text-lg font-semibold tabular">{formatMoney(totals.finalTotalCents)}</p>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-muted uppercase">Remaining</p>
              <p className={cn("text-lg font-semibold tabular", remainingCents > 0 ? "text-unpaid" : "text-paid")}>
                {formatMoney(remainingCents)}
              </p>
            </div>
          </div>
          {showErr("amount") && <p className="mt-2 text-sm text-unpaid">{showErr("amount")}</p>}
        </Step>

        {needsMethod && (
          <Step n={6} title="Payment Method" error={showErr("method")}>
            <PaymentMethodSelector value={method} onChange={setMethod} error={Boolean(showErr("method"))} />
          </Step>
        )}

        <div>
          {notesOpen ? (
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" maxLength={1000} aria-label="Sale notes" autoFocus />
          ) : (
            <button type="button" onClick={() => setNotesOpen(true)} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink">
              <StickyNote className="size-4" /> Add note
            </button>
          )}
        </div>
      </div>

      {/* Sticky action bar — stays reachable on phones above the bottom navigation */}
      <div className="sticky bottom-[calc(68px+env(safe-area-inset-bottom))] z-10 rounded-b-3xl border-t border-beige/70 bg-white/95 px-4 py-3 backdrop-blur sm:px-6 lg:bottom-0">
        <div className="flex items-center gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted">{lines.length ? `${lines.reduce((n, l) => n + l.quantity, 0)} service(s)` : "Total"}</p>
            <p className="font-display text-2xl leading-tight font-bold tabular">{formatMoney(totals.finalTotalCents)}</p>
          </div>
          <Button size="xl" className="flex-1" onClick={submit} loading={isPending} disabled={isPending}>
            {!isPending && <CheckCircle2 className="size-5" />}
            {isPending ? "Saving…" : "Complete Sale"}
          </Button>
        </div>
      </div>
    </section>
  );
}

function Step({ n, title, error, children }: { n: number; title: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2.5 flex items-center gap-2">
        <span className="flex size-6 items-center justify-center rounded-full bg-gold-soft text-xs font-bold text-gold">{n}</span>
        <h3 className="text-sm font-semibold tracking-wide text-ink-soft uppercase">{title}</h3>
      </div>
      {children}
      {error && (
        <p className="mt-2 text-sm text-unpaid" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
