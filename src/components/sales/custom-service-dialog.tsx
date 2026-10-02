"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { centsToInput, toCents } from "@/lib/domain/money";
import { MAX_LINE_QUANTITY, validateCustomService, type CustomServiceDraft } from "@/lib/domain/cart";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input, MoneyInput } from "@/components/ui/form";

/**
 * Add (or edit) a one-off service for this sale only. It is never saved to the
 * Services catalog — that only happens if the owner adds it there manually.
 */
export function CustomServiceDialog({
  initial,
  onSave,
  onClose,
}: {
  initial?: CustomServiceDraft;
  onSave: (draft: CustomServiceDraft) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [price, setPrice] = useState(initial ? centsToInput(initial.unitPriceCents) : "");
  const [cost, setCost] = useState(initial?.estimatedCostCents ? centsToInput(initial.estimatedCostCents) : "");
  const [qty, setQty] = useState(initial?.quantity ?? 1);
  const [errors, setErrors] = useState<Partial<Record<"name" | "price" | "cost" | "quantity", string>>>({});

  const submit = () => {
    const unitPriceCents = price.trim() === "" ? null : toCents(price);
    const estimatedCostCents = cost.trim() === "" ? null : toCents(cost);
    const check = validateCustomService({ name, unitPriceCents, estimatedCostCents, quantity: qty });
    if (!check.ok) return setErrors(check.errors);
    onSave({ name: name.trim(), unitPriceCents: unitPriceCents!, estimatedCostCents: estimatedCostCents ?? 0, quantity: qty });
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={initial ? "Edit custom service" : "Other / Custom Service"}
      description="For this sale only — it won’t be added to your Services list."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit}>{initial ? "Save" : "Add to Sale"}</Button>
        </>
      }
    >
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label="Service name" htmlFor="custom-name" error={errors.name}>
          <Input
            id="custom-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Nail Repair"
            maxLength={80}
            autoFocus
            aria-invalid={Boolean(errors.name)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Price charged" htmlFor="custom-price" error={errors.price} hint="$0 for a free service">
            <MoneyInput id="custom-price" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" aria-invalid={Boolean(errors.price)} />
          </Field>
          <Field label="Estimated cost" htmlFor="custom-cost" optional error={errors.cost}>
            <MoneyInput id="custom-cost" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0" aria-invalid={Boolean(errors.cost)} />
          </Field>
        </div>
        <Field label="Quantity" error={errors.quantity}>
          <div className="inline-flex items-center rounded-full border border-beige bg-white">
            <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} className="flex size-10 items-center justify-center rounded-full text-ink-soft hover:bg-cream" aria-label="Decrease quantity">
              <Minus className="size-4" />
            </button>
            <span className="w-8 text-center font-semibold tabular" aria-label="Quantity">
              {qty}
            </span>
            <button type="button" onClick={() => setQty((q) => Math.min(MAX_LINE_QUANTITY, q + 1))} className="flex size-10 items-center justify-center rounded-full text-ink-soft hover:bg-cream" aria-label="Increase quantity">
              <Plus className="size-4" />
            </button>
          </div>
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
