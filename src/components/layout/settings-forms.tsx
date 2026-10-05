"use client";

import { useRef, useState, useTransition } from "react";
import { changeEmailAction, changePasswordAction, updateProfileAction, updateSalonAction } from "@/server/actions/account";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { safeAction } from "@/lib/safe-action";
import type { ActionResult } from "@/server/actions/result";

function useForm(
  action: (fd: FormData) => Promise<ActionResult<unknown>>,
  success: string,
  reset = false,
  successDetail?: (data: unknown) => string | undefined,
) {
  const toast = useToast();
  const ref = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const submit = (fd: FormData) =>
    start(async () => {
      const res = await safeAction(() => action(fd));
      if (!res.ok) {
        setError(res.error);
        setFieldErrors(res.fieldErrors ?? {});
        return;
      }
      setError(null);
      setFieldErrors({});
      toast({ tone: "success", title: success, description: successDetail?.(res.data) });
      if (reset) ref.current?.reset();
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

export function ProfileForm({ name }: { name: string }) {
  const f = useForm(updateProfileAction, "Profile saved.");
  return (
    <form ref={f.ref} action={f.submit} className="space-y-4">
      <FormError message={f.error} />
      <Field label="Your name" htmlFor="profile-name" hint="Shown in the Home greeting." error={f.fieldErrors.name}>
        <Input id="profile-name" name="name" defaultValue={name} required maxLength={80} />
      </Field>
      <Button type="submit" loading={f.pending}>
        Save
      </Button>
    </form>
  );
}

const otherDevices = (data: unknown) => {
  const n = (data as { revokedOtherSessions?: number } | undefined)?.revokedOtherSessions ?? 0;
  return n > 0 ? `You were signed out on ${n} other device${n === 1 ? "" : "s"}.` : "Other devices will need to log in again.";
};

export function PasswordForm() {
  const f = useForm(changePasswordAction, "Password changed.", true, otherDevices);
  return (
    <form ref={f.ref} action={f.submit} className="space-y-4">
      <FormError message={f.error} />
      <Field label="Current password" htmlFor="currentPassword" error={f.fieldErrors.currentPassword}>
        <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="New password" htmlFor="new-password" error={f.fieldErrors.password} hint="At least 8 characters, with a letter and a number.">
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

/** Change the login email. Requires the current password; signs out other devices. */
export function EmailForm({ email }: { email: string }) {
  const f = useForm(changeEmailAction, "Login email changed.", true, (data) => {
    const d = data as { email?: string } | undefined;
    return d?.email ? `Use ${d.email} next time you log in. ${otherDevices(data)}` : undefined;
  });
  return (
    <form ref={f.ref} action={f.submit} className="space-y-4">
      <FormError message={f.error} />
      <Field label="Current login email" htmlFor="current-email">
        <Input id="current-email" value={email} disabled readOnly />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="New email" htmlFor="new-email" error={f.fieldErrors.newEmail}>
          <Input id="new-email" name="newEmail" type="email" autoComplete="email" required maxLength={200} />
        </Field>
        <Field label="Current password" htmlFor="email-current-password" error={f.fieldErrors.currentPassword}>
          <Input id="email-current-password" name="currentPassword" type="password" autoComplete="current-password" required />
        </Field>
      </div>
      <Button type="submit" loading={f.pending}>
        Change email
      </Button>
    </form>
  );
}
