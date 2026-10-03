"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, UserPlus } from "lucide-react";
import { createClientAction, updateClientAction } from "@/server/actions/clients";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { safeAction } from "@/lib/safe-action";

export interface ClientFormValues {
  firstName: string;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
}

export function ClientFormButton({ client, id }: { client?: ClientFormValues; id?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {client ? (
        <Button variant="outline" onClick={() => setOpen(true)}>
          <Pencil className="size-4" /> Edit
        </Button>
      ) : (
        <Button onClick={() => setOpen(true)}>
          <UserPlus className="size-4" /> New Client
        </Button>
      )}
      {open && <ClientFormModal client={client} id={id} onClose={() => setOpen(false)} />}
    </>
  );
}

function ClientFormModal({ client, id, onClose }: { client?: ClientFormValues; id?: string; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const submit = (fd: FormData) => {
    const input = {
      firstName: String(fd.get("firstName") ?? ""),
      lastName: String(fd.get("lastName") ?? ""),
      phone: String(fd.get("phone") ?? ""),
      email: String(fd.get("email") ?? ""),
      notes: String(fd.get("notes") ?? ""),
    };
    startTransition(async () => {
      const res = await safeAction<unknown>(() => (id ? updateClientAction(id, input) : createClientAction(input)));
      if (!res.ok) {
        setError(res.error);
        setFieldErrors(res.fieldErrors ?? {});
        return;
      }
      toast({ tone: "success", title: id ? "Client updated." : "Client added." });
      onClose();
      // New client: open the profile (rendered fresh). Edit: the action response
      // already carries the refreshed profile page.
      if (!id && res.data && typeof res.data === "object" && "id" in res.data) router.push(`/clients/${res.data.id}`);
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={id ? "Edit client" : "New client"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="client-form" loading={pending}>
            Save
          </Button>
        </>
      }
    >
      <form id="client-form" action={submit} className="space-y-4">
        <FormError message={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" htmlFor="firstName" error={fieldErrors.firstName}>
            <Input id="firstName" name="firstName" defaultValue={client?.firstName} required maxLength={80} autoFocus />
          </Field>
          <Field label="Last name" htmlFor="lastName" optional error={fieldErrors.lastName}>
            <Input id="lastName" name="lastName" defaultValue={client?.lastName ?? ""} maxLength={80} />
          </Field>
        </div>
        <Field label="Phone" htmlFor="phone" optional error={fieldErrors.phone}>
          <Input id="phone" name="phone" type="tel" inputMode="tel" defaultValue={client?.phone ?? ""} maxLength={30} />
        </Field>
        <Field label="Email" htmlFor="email" optional error={fieldErrors.email}>
          <Input id="email" name="email" type="email" defaultValue={client?.email ?? ""} maxLength={200} />
        </Field>
        <Field label="Notes" htmlFor="notes" optional error={fieldErrors.notes}>
          <Textarea id="notes" name="notes" defaultValue={client?.notes ?? ""} maxLength={1000} />
        </Field>
      </form>
    </Modal>
  );
}
