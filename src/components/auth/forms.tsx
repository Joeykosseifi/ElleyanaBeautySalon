"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { forgotPasswordAction, loginAction, resetPasswordAction, setupOwnerAction } from "@/server/actions/account";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/form";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, null);
  // Controlled so the email survives React's automatic form reset after a failed attempt.
  const [email, setEmail] = useState("");
  return (
    <form action={action} className="space-y-4">
      <h1 className="text-xl font-semibold text-ink">Log in</h1>
      <FormError message={state && !state.ok ? state.error : null} />
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        Login
      </Button>
      <div className="text-center">
        <Link href="/forgot-password" className="text-sm font-medium text-rose hover:text-rose-dark">
          Forgot Password?
        </Link>
      </div>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(forgotPasswordAction, null);
  if (state?.ok) {
    return (
      <div className="space-y-4 text-center">
        <CheckCircle2 className="mx-auto size-10 text-paid" />
        <p className="text-sm text-ink-soft">{state.message}</p>
        <Link href="/login" className="inline-block text-sm font-medium text-rose">
          Back to login
        </Link>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-ink">Forgot password</h1>
        <p className="mt-1 text-sm text-muted">Enter your email and we&apos;ll send you a link to reset your password.</p>
      </div>
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        Send reset link
      </Button>
      <div className="text-center">
        <Link href="/login" className="text-sm font-medium text-rose">
          Back to login
        </Link>
      </div>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, null);
  if (state?.ok) {
    return (
      <div className="space-y-4 text-center">
        <CheckCircle2 className="mx-auto size-10 text-paid" />
        <p className="text-sm text-ink-soft">{state.message}</p>
        <Link href="/login" className="inline-block text-sm font-medium text-rose">
          Go to login
        </Link>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <h1 className="text-xl font-semibold text-ink">Choose a new password</h1>
      <FormError message={state && !state.ok ? state.error : null} />
      <input type="hidden" name="token" value={token} />
      <Field label="New password" htmlFor="password" hint="At least 8 characters.">
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required autoFocus />
      </Field>
      <Field label="Confirm password" htmlFor="confirm">
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        Update password
      </Button>
    </form>
  );
}

/** First-run: create the single OWNER account. Shown only on a brand-new database. */
export function SetupOwnerForm() {
  const [state, action, pending] = useActionState(setupOwnerAction, null);
  // Controlled so values survive React's automatic form reset after a failed attempt.
  const [name, setName] = useState("Elleyana");
  const [email, setEmail] = useState("");
  const fe = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  if (state?.ok) {
    return (
      <div className="space-y-4 text-center">
        <CheckCircle2 className="mx-auto size-10 text-paid" />
        <p className="text-sm text-ink-soft">{state.message ?? "Account created."}</p>
        <Link href="/login" className="inline-block text-sm font-medium text-rose">
          Go to login
        </Link>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4" noValidate>
      <div>
        <h1 className="text-xl font-semibold text-ink">Create owner account</h1>
        <p className="mt-1 text-sm text-muted">Welcome to SalonFlow. This one-time step creates the salon owner&apos;s login.</p>
      </div>
      <FormError message={state && !state.ok && !Object.keys(fe).length ? state.error : null} />
      <Field label="Owner name" htmlFor="name" error={fe.name}>
        <Input id="name" name="name" autoComplete="name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Email" htmlFor="email" error={fe.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Password" htmlFor="password" error={fe.password} hint="At least 8 characters, with a letter and a number.">
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <Field label="Confirm password" htmlFor="confirm" error={fe.confirm}>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        Create account
      </Button>
    </form>
  );
}
