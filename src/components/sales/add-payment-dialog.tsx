"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { formatMoney, centsToInput, toCents } from "@/lib/domain/money";
import type { PaymentMethod } from "@/lib/domain/reports";
import { addPaymentAction } from "@/server/actions/sales";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, MoneyInput } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { PaymentMethodSelector } from "./payment-method-selector";
import { safeAction } from "@/lib/safe-action";

export function AddPaymentButton({
  saleId,
  saleNumber,
  remainingCents,
  clientName,
  size = "lg",
  className,
}: {
  saleId: string;
  saleNumber: number;
  remainingCents: number;
  clientName: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size={size} onClick={() => setOpen(true)} className={className}>
        <Plus className="size-4" /> Add Payment
      </Button>
      {open && (
        <AddPaymentDialog
          saleId={saleId}
          saleNumber={saleNumber}
          remainingCents={remainingCents}
          clientName={clientName}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function AddPaymentDialog({
  saleId,
  saleNumber,
  remainingCents,
  clientName,
  onClose,
}: {
  saleId: string;
  saleNumber: number;
  remainingCents: number;
  clientName: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const [amount, setAmount] = useState(centsToInput(remainingCents));
  const [method, setMethod] = useState<PaymentMethod | null>("CASH");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const cents = toCents(amount);
  const after = Number.isNaN(cents) ? remainingCents : Math.max(0, remainingCents - cents);

  const submit = () => {
    setError(null);
    if (Number.isNaN(cents) || cents <= 0) return setError("Enter an amount greater than zero.");
    if (cents > remainingCents) return setError(`Payment cannot be more than the remaining ${formatMoney(remainingCents)}.`);
    if (!method) return setError("Choose a payment method.");
    startTransition(async () => {
      const res = await safeAction(() => addPaymentAction({ saleId, amountCents: cents, method, notes: notes || null }));
      if (!res.ok) return setError(res.error);
      toast({
        tone: "success",
        title: "Payment recorded.",
        description: res.data.remainingCents > 0 ? `${formatMoney(res.data.remainingCents)} remaining.` : "Sale is now fully paid.",
      });
      onClose();
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Add Payment"
      description={`Sale #${saleNumber} · ${clientName} owes ${formatMoney(remainingCents)}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} loading={pending}>
            Save Payment
          </Button>
        </>
      }
    >
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <FormError message={error} />
        <Field label="Amount" htmlFor="pay-amount">
          <MoneyInput id="pay-amount" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-12 text-lg font-semibold" autoFocus />
          <div className="mt-2 flex flex-wrap gap-2">
            <QuickAmount label={`Full ${formatMoney(remainingCents)}`} onClick={() => setAmount(centsToInput(remainingCents))} />
            {remainingCents >= 200 && <QuickAmount label="Half" onClick={() => setAmount(centsToInput(Math.round(remainingCents / 200) * 100))} />}
          </div>
        </Field>
        <Field label="Payment method">
          <PaymentMethodSelector value={method} onChange={setMethod} />
        </Field>
        <Field label="Note" htmlFor="pay-notes" optional>
          <Input id="pay-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
        </Field>
        <div className="flex justify-between rounded-xl bg-cream/70 px-4 py-3 text-sm">
          <span className="text-ink-soft">Remaining after this payment</span>
          <span className={`font-semibold tabular ${after > 0 ? "text-unpaid" : "text-paid"}`}>{formatMoney(after)}</span>
        </div>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

function QuickAmount({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="h-8 rounded-full border border-beige bg-white px-3 text-xs font-medium text-ink-soft hover:bg-cream">
      {label}
    </button>
  );
}
