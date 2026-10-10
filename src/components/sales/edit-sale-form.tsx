"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Plus, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/domain/money";
import { calculatePaymentStatus, calculateRemaining, calculateSaleTotals } from "@/lib/domain/sale-calculations";
import { PAYMENT_STATUS_LABELS } from "@/lib/domain/labels";
import {
  addCustomService,
  cartToLineInputs,
  catalogQuantity,
  removeLine,
  resetLinePrice,
  setLinePrice,
  setLineQuantity,
  toggleCatalogService,
  updateCustomService,
  type CartLine,
  type CustomServiceDraft,
} from "@/lib/domain/cart";
import { updateSaleAction } from "@/server/actions/sales";
import type { EditSaleItemInput, UpdateSaleInput } from "@/lib/validation/sale";
import type { SaleForEdit } from "@/server/services/sale-edit";
import { safeAction } from "@/lib/safe-action";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/form";
import { Chip } from "@/components/ui/chip";
import { ClientSelector } from "./client-selector";
import { ServiceCard } from "./service-card";
import { OrderSummary, type DiscountDraft } from "./order-summary";
import { CustomServiceDialog } from "./custom-service-dialog";
import type { ClientChoice, QuickCategory } from "./types";

type EmployeeOption = { id: string; name: string; active: boolean };

/** Existing sale lines become cart lines whose key is the SaleItem id. */
function initialLines(sale: SaleForEdit): CartLine[] {
  return sale.items.map((i) =>
    i.isCustom
      ? { kind: "custom", key: i.id, name: i.name, unitPriceCents: i.unitPriceCents, estimatedCostCents: i.estimatedCostCents, quantity: i.quantity }
      : {
          kind: "catalog",
          key: i.id,
          // A service deleted from the catalog keeps its line; it just can't be re-added.
          serviceId: i.serviceId ?? `removed:${i.id}`,
          name: i.name,
          standardPriceCents: i.standardPriceCents ?? i.unitPriceCents,
          unitPriceCents: i.unitPriceCents,
          quantity: i.quantity,
        },
  );
}

function initialDiscount(sale: SaleForEdit): DiscountDraft {
  if (!sale.discount) return { open: false, type: "FIXED", input: "" };
  return { open: true, type: sale.discount.type, input: String(sale.discount.value / 100) };
}

export function EditSaleForm({
  sale,
  categories,
  employees,
  maxDate,
}: {
  sale: SaleForEdit;
  categories: QuickCategory[];
  employees: EmployeeOption[];
  /** "yyyy-MM-ddTHH:mm" now, in the salon's time zone */
  maxDate: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const savingRef = useRef(false);
  const existingIds = useRef(new Set(sale.items.map((i) => i.id)));

  const tabs = categories.filter((c) => c.services.length > 0);
  const [tab, setTab] = useState(tabs[0]?.id ?? "");
  const [client, setClient] = useState<ClientChoice>(sale.client ? { kind: "existing", client: sale.client } : { kind: "walkin" });
  const [lines, setLines] = useState<CartLine[]>(() => initialLines(sale));
  const [lineEmployee, setLineEmployee] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(sale.items.map((i) => [i.id, i.employeeId])),
  );
  const defaultEmployee = sale.items.find((i) => i.employeeId)?.employeeId ?? null;
  const [customDialog, setCustomDialog] = useState<null | "new" | string>(null);
  const [discount, setDiscount] = useState<DiscountDraft>(() => initialDiscount(sale));
  const [notes, setNotes] = useState(sale.notes);
  const [serviceDate, setServiceDate] = useState(sale.serviceDate);
  const [conflict, setConflict] = useState(false);
  // The form is disabled until React has taken over the page: text typed into the
  // server-rendered inputs before hydration could otherwise be merged with the
  // preloaded values (seen with notes typed right after a reload).
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  // Same discount handling as Quick Add: FIXED dollars → cents, PERCENTAGE % → basis points.
  const discountRaw = discount.open && discount.input.trim() ? Number(discount.input) : 0;
  const discountInvalid =
    discount.open && discount.input.trim() !== "" && (!Number.isFinite(discountRaw) || discountRaw < 0 || (discount.type === "PERCENTAGE" && discountRaw > 100));
  const discountValue = discountInvalid ? 0 : Math.round(discountRaw * 100);
  const totals = calculateSaleTotals(cartToLineInputs(lines), discountValue > 0 ? { type: discount.type, value: discountValue } : null);
  const remaining = calculateRemaining(totals.finalTotalCents, sale.amountPaidCents);
  const newStatus = calculatePaymentStatus(totals.finalTotalCents, sale.amountPaidCents);
  const belowPaid = totals.finalTotalCents < sale.amountPaidCents;

  const errors: string[] = [];
  if (lines.length === 0) errors.push("A sale needs at least one service.");
  if (discountInvalid) errors.push("Enter a valid discount.");
  if (belowPaid)
    errors.push(
      `The client already paid ${formatMoney(sale.amountPaidCents)}. The new total (${formatMoney(totals.finalTotalCents)}) can't be lower than that — SalonFlow doesn't refund automatically.`,
    );
  if (client.kind === "none") errors.push("Choose a client, or Walk-in Client.");
  else if (client.kind === "new" && !client.draft.firstName.trim()) errors.push("Enter the client's name.");
  else if (client.kind === "walkin" && newStatus !== "PAID") errors.push("Unpaid or partially paid sales need a client name.");
  if (!serviceDate) errors.push("Choose the date and time of the service.");

  const employeeFor = (key: string) => (key in lineEmployee ? lineEmployee[key] : defaultEmployee);
  const editingCustom = customDialog && customDialog !== "new" ? lines.find((l) => l.key === customDialog) : undefined;
  const saveCustom = (draft: CustomServiceDraft) => {
    setLines((list) => (customDialog === "new" ? addCustomService(list, draft) : updateCustomService(list, customDialog!, draft)));
    setCustomDialog(null);
  };

  const toItems = (): EditSaleItemInput[] =>
    lines.map((l) => {
      const employeeId = employeeFor(l.key);
      if (existingIds.current.has(l.key)) {
        return l.kind === "custom"
          ? { kind: "existing", itemId: l.key, quantity: l.quantity, unitPriceCents: l.unitPriceCents, employeeId, name: l.name, estimatedCostCents: l.estimatedCostCents }
          : { kind: "existing", itemId: l.key, quantity: l.quantity, unitPriceCents: l.unitPriceCents, employeeId };
      }
      return l.kind === "custom"
        ? { kind: "custom", name: l.name, quantity: l.quantity, unitPriceCents: l.unitPriceCents, estimatedCostCents: l.estimatedCostCents, employeeId }
        : { kind: "catalog", serviceId: l.serviceId, quantity: l.quantity, unitPriceCents: l.unitPriceCents, employeeId };
    });

  const save = () => {
    if (savingRef.current) return;
    if (errors.length) {
      toast({ tone: "error", title: errors[0] });
      return;
    }
    savingRef.current = true;
    const input: UpdateSaleInput = {
      saleId: sale.id,
      expectedUpdatedAt: sale.updatedAt,
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
      items: toItems(),
      discount: discountValue > 0 ? { type: discount.type, value: discountValue } : null,
      notes: notes.trim() || null,
      serviceDate,
    };
    startTransition(async () => {
      const res = await safeAction(() => updateSaleAction(input));
      savingRef.current = false;
      if (!res.ok) {
        if (/changed somewhere else/.test(res.error)) setConflict(true);
        toast({ tone: "error", title: "Sale not updated", description: res.error });
        return;
      }
      const r = res.data;
      if (!r.changed) {
        toast({ tone: "info", title: "No changes to save." });
        router.push(`/sales/${sale.id}`);
        return;
      }
      toast({
        tone: "success",
        title: `Sale #${r.number} updated.`,
        description: `Total ${formatMoney(r.previousTotalCents)} → ${formatMoney(r.finalTotalCents)} · ${
          r.remainingCents > 0 ? `${formatMoney(r.remainingCents)} remaining` : "Fully paid"
        }`,
      });
      router.push(`/sales/${sale.id}`);
    });
  };

  const otherServiceCard = (
    <button
      type="button"
      onClick={() => setCustomDialog("new")}
      className="flex min-h-[88px] flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-gold/50 bg-gold-soft/40 p-3 text-center text-gold transition-colors hover:border-gold hover:bg-gold-soft sm:min-h-24"
    >
      <Plus className="size-5" />
      <span className="text-[15px] font-semibold">Other Service</span>
      <span className="text-xs text-ink-soft/70">Custom name & price</span>
    </button>
  );
  const activeServices = tabs.find((t) => t.id === tab)?.services ?? [];
  const selectable = (current: string | null) => employees.filter((e) => e.active || e.id === current);

  return (
    <section aria-labelledby="edit-sale-title" className="min-w-0 rounded-3xl border border-beige/70 bg-white shadow-soft">
      <div className="px-4 pt-5 sm:px-6">
        <h2 id="edit-sale-title" className="font-display text-2xl font-bold text-ink sm:text-3xl">
          Edit Sale #{sale.number}
        </h2>
        <p className="text-sm text-muted">Change anything below, then Save Changes. Payments already received are kept as they are.</p>
      </div>

      {conflict && (
        <div role="alert" className="mx-4 mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-partial/40 bg-partial-bg p-3 text-sm sm:mx-6">
          <AlertTriangle className="size-5 shrink-0 text-partial" />
          <span className="flex-1">This sale changed after you opened it. Reload to get the latest version (your edits here will be lost).</span>
          <Button size="sm" variant="secondary" onClick={() => window.location.reload()}>
            <RefreshCw className="size-4" /> Reload
          </Button>
        </div>
      )}

      <fieldset disabled={!ready} aria-busy={!ready} className="m-0 min-w-0 space-y-6 border-0 px-4 py-5 sm:px-6">
        <Block title="Client">
          <ClientSelector value={client} onChange={setClient} needsIdentity={newStatus !== "PAID"} />
        </Block>

        <Block title="Date & time of service">
          <Input
            type="datetime-local"
            aria-label="Date and time of service"
            value={serviceDate}
            max={maxDate}
            onChange={(e) => setServiceDate(e.target.value)}
            className="max-w-xs"
          />
        </Block>

        <Block title="Add services">
          {tabs.length > 0 && (
            <div className="-mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-none" role="tablist" aria-label="Service categories">
              {tabs.map((c) => (
                <Chip key={c.id} role="tab" aria-selected={tab === c.id} selected={tab === c.id} onClick={() => setTab(c.id)}>
                  {c.name}
                </Chip>
              ))}
            </div>
          )}
          <div role="tabpanel" className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 2xl:grid-cols-4">
            {activeServices.map((s) => (
              <ServiceCard key={s.id} service={s} quantity={catalogQuantity(lines, s.id)} onToggle={() => setLines((list) => toggleCatalogService(list, s))} />
            ))}
            {otherServiceCard}
          </div>
        </Block>

        <Block title="Services on this sale">
          <OrderSummary
            lines={lines}
            totals={totals}
            discount={discount}
            onDiscountChange={setDiscount}
            onQuantity={(key, qty) => setLines((list) => setLineQuantity(list, key, qty))}
            onPrice={(key, cents) => setLines((list) => setLinePrice(list, key, cents))}
            onResetPrice={(key) => setLines((list) => resetLinePrice(list, key))}
            onRemove={(key) => setLines((list) => removeLine(list, key))}
            onEditCustom={setCustomDialog}
            discountInvalid={discountInvalid}
          />
        </Block>

        {lines.length > 0 && (
          <Block title="Who performed each service">
            <ul className="divide-y divide-beige/60 rounded-2xl border border-beige/70">
              {lines.map((l) => {
                const current = employeeFor(l.key);
                return (
                  <li key={l.key} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                    <span className="min-w-0 truncate text-sm font-medium text-ink">
                      {l.name}
                      {l.quantity > 1 ? ` ×${l.quantity}` : ""}
                    </span>
                    <Select
                      aria-label={`Employee for ${l.name}`}
                      value={current ?? ""}
                      onChange={(e) => setLineEmployee((m) => ({ ...m, [l.key]: e.target.value || null }))}
                      className="h-10 w-full sm:w-56"
                    >
                      <option value="">No employee</option>
                      {selectable(current).map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.active ? e.name : `${e.name} (inactive)`}
                        </option>
                      ))}
                    </Select>
                  </li>
                );
              })}
            </ul>
          </Block>
        )}

        <Block title="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" maxLength={1000} aria-label="Sale notes" />
        </Block>

        <Block title="Payments">
          <div className="grid grid-cols-2 gap-3 rounded-2xl bg-cream/60 p-3 text-sm sm:grid-cols-4">
            <Figure label="Original total" value={formatMoney(sale.finalTotalCents)} />
            <Figure label="New total" value={formatMoney(totals.finalTotalCents)} tone={totals.finalTotalCents !== sale.finalTotalCents ? "text-rose-dark" : undefined} />
            <Figure label="Already paid" value={formatMoney(sale.amountPaidCents)} tone="text-paid" />
            <Figure label="Remaining" value={formatMoney(remaining)} tone={remaining > 0 ? "text-unpaid" : "text-paid"} />
          </div>
          <p className="mt-2 text-sm text-muted">
            Status after saving: <span className="font-medium text-ink">{PAYMENT_STATUS_LABELS[newStatus]}</span>. Payments are never changed
            here — record extra money with Add Payment on the sale page.
          </p>
          {belowPaid && (
            <p role="alert" className="mt-2 rounded-xl bg-unpaid-bg/70 px-3 py-2 text-sm text-unpaid">
              {errors.find((e) => e.startsWith("The client already paid"))}
            </p>
          )}
        </Block>
      </fieldset>

      <div className="sticky bottom-[calc(68px+env(safe-area-inset-bottom))] z-10 rounded-b-3xl border-t border-beige/70 bg-white/95 px-4 py-3 backdrop-blur sm:px-6 lg:bottom-0">
        <div className="flex items-center gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted tabular">
              {formatMoney(sale.finalTotalCents)} → <span className={cn(belowPaid && "text-unpaid")}>new total</span>
            </p>
            <p className="font-display text-2xl leading-tight font-bold tabular">{formatMoney(totals.finalTotalCents)}</p>
          </div>
          <Link href={`/sales/${sale.id}`} className="inline-flex h-12 items-center rounded-xl px-3 text-sm font-medium text-muted hover:text-ink">
            Cancel
          </Link>
          <Button size="xl" className="flex-1" onClick={save} loading={isPending} disabled={!ready || isPending || belowPaid}>
            {!isPending && <CheckCircle2 className="size-5" />}
            {isPending ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </div>
      {customDialog && (
        <CustomServiceDialog initial={editingCustom?.kind === "custom" ? editingCustom : undefined} onSave={saveCustom} onClose={() => setCustomDialog(null)} />
      )}
    </section>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2.5 text-sm font-semibold tracking-wide text-ink-soft uppercase">{title}</h3>
      {children}
    </div>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted uppercase">{label}</p>
      <p className={cn("text-lg font-semibold tabular", tone)}>{value}</p>
    </div>
  );
}
