"use client";

import { useState, useTransition } from "react";
import { Pencil, Plus } from "lucide-react";
import { COMMISSION_TYPE_LABELS } from "@/lib/domain/labels";
import { saveEmployeeAction } from "@/server/actions/catalog";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FormError, Input, Select } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { safeAction } from "@/lib/safe-action";

export interface EmployeeValues {
  id: string;
  name: string;
  phone: string | null;
  role: string | null;
  active: boolean;
  commissionType: "NONE" | "PERCENTAGE" | "FIXED";
  commissionValue: number;
}

export function EmployeeFormButton({ employee }: { employee?: EmployeeValues }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {employee ? (
        <button type="button" onClick={() => setOpen(true)} className="flex size-9 items-center justify-center rounded-full text-muted hover:bg-cream hover:text-ink" aria-label={`Edit ${employee.name}`}>
          <Pencil className="size-4" />
        </button>
      ) : (
        <Button onClick={() => setOpen(true)}>
          <Plus className="size-4" /> Add Employee
        </Button>
      )}
      {open && <EmployeeForm employee={employee} onClose={() => setOpen(false)} />}
    </>
  );
}

function EmployeeForm({ employee, onClose }: { employee?: EmployeeValues; onClose: () => void }) {
  const toast = useToast();
  const [type, setType] = useState(employee?.commissionType ?? "NONE");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();

  const submit = (fd: FormData) =>
    start(async () => {
      const res = await safeAction(() => saveEmployeeAction(employee?.id ?? null, fd));
      if (!res.ok) {
        setError(res.error);
        setFieldErrors(res.fieldErrors ?? {});
        return;
      }
      toast({ tone: "success", title: employee ? "Employee updated." : "Employee added." });
      onClose();
    });

  return (
    <Modal
      open
      onClose={onClose}
      title={employee ? `Edit ${employee.name}` : "New employee"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="employee-form" loading={pending}>
            Save
          </Button>
        </>
      }
    >
      <form id="employee-form" action={submit} className="space-y-4">
        <FormError message={error} />
        <Field label="Name" htmlFor="emp-name" error={fieldErrors.name}>
          <Input id="emp-name" name="name" defaultValue={employee?.name} required maxLength={80} autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Phone" htmlFor="emp-phone" optional>
            <Input id="emp-phone" name="phone" type="tel" defaultValue={employee?.phone ?? ""} maxLength={30} />
          </Field>
          <Field label="Role" htmlFor="emp-role" optional>
            <Input id="emp-role" name="role" defaultValue={employee?.role ?? ""} placeholder="e.g. Hair Stylist" maxLength={60} />
          </Field>
        </div>
        <Field label="Commission" htmlFor="emp-ctype" hint="Optional. Used for estimated commission in Reports.">
          <Select id="emp-ctype" name="commissionType" value={type} onChange={(e) => setType(e.target.value as EmployeeValues["commissionType"])}>
            {Object.entries(COMMISSION_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        {type !== "NONE" && (
          <Field
            label={type === "PERCENTAGE" ? "Commission (%)" : "Amount per service ($)"}
            htmlFor="emp-cvalue"
            error={fieldErrors.commissionValue}
          >
            <Input
              id="emp-cvalue"
              name="commissionValue"
              inputMode="decimal"
              defaultValue={employee && employee.commissionType === type ? String(employee.commissionValue / 100) : ""}
              required
            />
          </Field>
        )}
        <Checkbox name="active" defaultChecked={employee?.active ?? true} label="Active — can be selected on Quick Add Sale" />
      </form>
    </Modal>
  );
}
