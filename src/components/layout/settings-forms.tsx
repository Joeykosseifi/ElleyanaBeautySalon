"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/server/actions/result";
import { changePasswordAction, updateProfileAction, updateSalonAction } from "@/server/actions/account";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";

function useForm(action: (fd: FormData) => Promise<ActionResult<unknown>>, success: string, reset = false) {
  const router = useRouter();
  const toast = useToast();
  const ref = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const submit = (fd: FormData) =>
    start(async () => {
      const res = await action(fd);
      if (!res.ok) {
        setError(res.error);
        setFieldErrors(res.fieldErrors ?? {});
        return;
      }
      setError(null);
      setFieldErrors({});
      toast({ tone: "success", title: success });
      if (reset) ref.current?.reset();
      router.refresh();
    });
  return { ref, error, fieldErrors, pending, submit };
}

export function SalonSettingsForm({ name, timezone, timezones, disabled }: { name: string; timezone: string; timezones: string[]; disabled: boolean }) {
  const f = useForm(updateSalonAction, "Salon settings saved.");
  return (
    <form ref={f.ref} action={f.submit} className="space-y-4">
      <FormError message={f.error} />
      <Field label="Salon name" htmlFor="salon-name" error={f.fieldErrors.name}>
        <Input id="salon-name" name="name" defaultValue={name} required maxLength={80} disabled={disabled} />
      </Field>
      <Field label="Time zone" htmlFor="tz" hint="Decides when “Today” starts and ends in reports." error={f.fieldErrors.timezone}>
        <Select id="tz" name="timezone" defaultValue={timezone} disabled={disabled}>
          {timezones.map((t) => (
            <option key={t} value={t}>
              {t.replace(/_/g, " ")}
            </option>
          ))}
        </Select>
      </Field>
      {disabled ? <p className="text-sm text-muted">Only the salon owner can change these settings.</p> : <Button type="submit" loading={f.pending}>Save</Button>}
    </form>
  );
}

export function ProfileForm({ name, email }: { name: string; email: string }) {
  const f = useForm(updateProfileAction, "Profile saved.");
  return (
    <form ref={f.ref} action={f.submit} className="space-y-4">
      <FormError message={f.error} />
      <Field label="Your name" htmlFor="profile-name" hint="Shown in the Home greeting." error={f.fieldErrors.name}>
        <Input id="profile-name" name="name" defaultValue={name} required maxLength={80} />
      </Field>
      <Field label="Email" htmlFor="profile-email">
        <Input id="profile-email" value={email} disabled readOnly />
      </Field>
      <Button type="submit" loading={f.pending}>
        Save
      </Button>
    </form>
  );
}

export function PasswordForm() {
  const f = useForm(changePasswordAction, "Password changed.", true);
  return (
    <form ref={f.ref} action={f.submit} className="space-y-4">
      <FormError message={f.error} />
      <Field label="Current password" htmlFor="currentPassword" error={f.fieldErrors.currentPassword}>
        <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="New password" htmlFor="new-password" error={f.fieldErrors.password} hint="At least 8 characters.">
          <Input id="new-password" name="password" type="password" autoComplete="new-password" minLength={8} required />
        </Field>
        <Field label="Confirm new password" htmlFor="confirm" error={f.fieldErrors.confirm}>
          <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
        </Field>
      </div>
      <Button type="submit" loading={f.pending}>
        Change password
      </Button>
    </form>
  );
}
