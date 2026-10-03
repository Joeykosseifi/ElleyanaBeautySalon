"use client";

import { useState, useTransition } from "react";
import { Ban } from "lucide-react";
import { formatMoney } from "@/lib/domain/money";
import { voidSaleAction } from "@/server/actions/sales";
import { Button } from "@/components/ui/button";
import { Field, FormError, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { safeAction } from "@/lib/safe-action";

/**
 * "Void Sale" — the safe alternative to deleting a sale entered by mistake. The record
 * stays for the audit trail; it just stops counting anywhere.
 */
export function VoidSaleButton({
  saleId,
  saleNumber,
  finalTotalCents,
  amountPaidCents,
}: {
  saleId: string;
  saleNumber: number;
  finalTotalCents: number;
  amountPaidCents: number;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const confirm = () =>
    start(async () => {
      setError(null);
      const res = await safeAction(() => voidSaleAction({ saleId, reason: reason.trim() || null }));
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      toast({ tone: "success", title: `Sale #${saleNumber} voided.`, description: "It no longer counts in totals, balances or reports." });
    });

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className="text-unpaid hover:bg-unpaid-bg">
        <Ban className="size-4" /> Void Sale
      </Button>
      <Modal
        open={open}
        onClose={() => !pending && setOpen(false)}
        size="sm"
        title={`Void Sale #${saleNumber}?`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Keep sale
            </Button>
            <Button variant="danger" onClick={confirm} loading={pending}>
              Void Sale
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-sm text-ink-soft">
          <FormError message={error} />
          <p>
            Use this for a sale entered by mistake. The {formatMoney(finalTotalCents)} sale
            {amountPaidCents > 0 ? ` and its ${formatMoney(amountPaidCents)} in payments` : ""} will be removed from every
            total, client balance and report.
          </p>
          <p>The record is kept and marked <strong className="text-unpaid">Voided</strong> for your history. This can&apos;t be undone.</p>
          <Field label="Reason" htmlFor="void-reason" optional>
            <Textarea
              id="void-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={300}
              placeholder="e.g. Entered twice by mistake"
              className="min-h-16"
            />
          </Field>
        </div>
      </Modal>
    </>
  );
}
