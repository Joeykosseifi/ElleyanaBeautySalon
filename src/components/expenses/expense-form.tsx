"use client";

import { useState, useTransition } from "react";
import { Paperclip, Pencil, Plus, Trash2 } from "lucide-react";
import { centsToInput } from "@/lib/domain/money";
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS, PAYMENT_METHOD_LABELS, type ExpenseCategory } from "@/lib/domain/labels";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/domain/reports";
import { deleteExpenseAction, saveExpenseAction } from "@/server/actions/expenses";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, MoneyInput, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { useToast } from "@/components/ui/toast";
import { safeAction } from "@/lib/safe-action";

export interface ExpenseValues {
  id: string;
  category: ExpenseCategory;
  description: string;
  amountCents: number;
  /** yyyy-MM-dd in salon time */
  day: string;
  paymentMethod: PaymentMethod | null;
  notes: string | null;
  receiptUrl: string | null;
}

export function AddExpenseButton({ today }: { today: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" /> Add Expense
      </Button>
      {open && <ExpenseForm today={today} onClose={() => setOpen(false)} />}
    </>
  );
}

export function ExpenseActions({ expense, today }: { expense: ExpenseValues; today: string }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="flex">
      <button type="button" onClick={() => setEditing(true)} className="flex size-9 items-center justify-center rounded-full text-muted hover:bg-cream hover:text-ink" aria-label={`Edit ${expense.description}`}>
        <Pencil className="size-4" />
      </button>
      <button type="button" onClick={() => setConfirming(true)} className="flex size-9 items-center justify-center rounded-full text-muted hover:bg-unpaid-bg hover:text-unpaid" aria-label={`Delete ${expense.description}`}>
        <Trash2 className="size-4" />
      </button>
      {editing && <ExpenseForm expense={expense} today={today} onClose={() => setEditing(false)} />}
      <ConfirmationDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        destructive
        loading={pending}
        title="Delete expense?"
        message={`“${expense.description}” will be removed from your reports.`}
        confirmLabel="Delete"
        onConfirm={() =>
          start(async () => {
            const res = await safeAction(() => deleteExpenseAction(expense.id));
            if (!res.ok) toast({ tone: "error", title: "Could not delete", description: res.error });
            else toast({ tone: "success", title: "Expense deleted." });
            setConfirming(false);
          })
        }
      />
    </div>
  );
}

function ExpenseForm({ expense, today, onClose }: { expense?: ExpenseValues; today: string; onClose: () => void }) {
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [removeReceipt, setRemoveReceipt] = useState(false);
  const [pending, start] = useTransition();

  const submit = (fd: FormData) => {
    const file = fd.get("receipt");
    if (file instanceof File && file.size > 5 * 1024 * 1024) {
      setError("Receipt must be 5 MB or smaller.");
      return;
    }
    if (removeReceipt) fd.set("removeReceipt", "true");
    start(async () => {
      const res = await safeAction(() => saveExpenseAction(expense?.id ?? null, fd));
      if (!res.ok) {
        setError(res.error);
        setFieldErrors(res.fieldErrors ?? {});
        return;
      }
      toast({ tone: "success", title: expense ? "Expense updated." : "Expense added." });
      onClose();
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={expense ? "Edit expense" : "Add expense"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="expense-form" loading={pending}>
            Save
          </Button>
        </>
      }
    >
      <form id="expense-form" action={submit} className="space-y-4">
        <FormError message={error} />
        <div className="grid grid-cols-2 gap-4">
          <Field label="Category" htmlFor="category" error={fieldErrors.category}>
            <Select id="category" name="category" defaultValue={expense?.category ?? "PRODUCTS"}>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {EXPENSE_CATEGORY_LABELS[c]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Amount" htmlFor="amount" error={fieldErrors.amount}>
            <MoneyInput id="amount" name="amount" defaultValue={expense ? centsToInput(expense.amountCents) : ""} required autoFocus />
          </Field>
        </div>
        <Field label="Description" htmlFor="description" error={fieldErrors.description}>
          <Input id="description" name="description" defaultValue={expense?.description} required maxLength={200} placeholder="e.g. Gel polish restock" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Date" htmlFor="date" error={fieldErrors.date}>
            <Input id="date" name="date" type="date" defaultValue={expense?.day ?? today} required />
          </Field>
          <Field label="Payment method" htmlFor="paymentMethod" optional>
            <Select id="paymentMethod" name="paymentMethod" defaultValue={expense?.paymentMethod ?? ""}>
              <option value="">—</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Notes" htmlFor="notes" optional>
          <Textarea id="notes" name="notes" defaultValue={expense?.notes ?? ""} maxLength={1000} />
        </Field>
        <Field label="Receipt image" htmlFor="receipt" optional hint="JPG, PNG, WEBP, HEIC or PDF up to 5 MB." error={fieldErrors.receipt}>
          {expense?.receiptUrl && !removeReceipt && (
            <div className="mb-2 flex items-center justify-between rounded-xl bg-cream/70 px-3 py-2 text-sm">
              <a href={expense.receiptUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-medium text-rose">
                <Paperclip className="size-4" /> Current receipt
              </a>
              <button type="button" onClick={() => setRemoveReceipt(true)} className="text-muted hover:text-unpaid">
                Remove
              </button>
            </div>
          )}
          <input
            id="receipt"
            name="receipt"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
            capture="environment"
            className="block w-full text-sm text-ink-soft file:mr-3 file:h-10 file:rounded-xl file:border-0 file:bg-blush file:px-4 file:text-sm file:font-medium file:text-rose-dark"
          />
        </Field>
      </form>
    </Modal>
  );
}
