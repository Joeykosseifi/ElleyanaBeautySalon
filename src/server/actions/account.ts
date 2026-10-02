"use server";

import { AuthError } from "next-auth";
import { revalidatePath } from "next/cache";
import { signIn, signOut } from "@/auth";
import { runAction, type ActionResult } from "./result";
import { changePassword, requestPasswordReset, resetPassword, updateProfile, updateSalonSettings } from "../services/account";
import { DomainError } from "../errors";
import { ZodError } from "zod";

export async function loginAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    await signIn("credentials", {
      email: String(fd.get("email") ?? ""),
      password: String(fd.get("password") ?? ""),
      redirectTo: "/",
    });
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof AuthError) return { ok: false, error: "Incorrect email or password." };
    throw err; // Next.js redirect on success
  }
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}

export async function forgotPasswordAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const link = await requestPasswordReset(String(fd.get("email") ?? ""), appUrl);
  if (link) {
    // No email provider is configured in the MVP: the link is written to the server
    // log. Plug an email service (Resend, SES, SMTP…) in here for production.
    console.info(`[password-reset] Reset link for ${String(fd.get("email"))}: ${link}`);
  }
  return {
    ok: true,
    data: undefined,
    message: "If an account exists for that email, a reset link has been sent.",
  };
}

export async function resetPasswordAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    await resetPassword({
      token: String(fd.get("token") ?? ""),
      password: String(fd.get("password") ?? ""),
      confirm: String(fd.get("confirm") ?? ""),
    });
    return { ok: true, data: undefined, message: "Your password has been updated. You can now log in." };
  } catch (err) {
    if (err instanceof DomainError) return { ok: false, error: err.message };
    if (err instanceof ZodError) return { ok: false, error: err.issues[0]?.message ?? "Please check the form." };
    throw err;
  }
}

export async function updateSalonAction(fd: FormData) {
  const res = await runAction(
    (ctx) => updateSalonSettings(ctx, { name: String(fd.get("name") ?? ""), timezone: String(fd.get("timezone") ?? "") }),
    ["OWNER"],
  );
  if (res.ok) revalidatePath("/", "layout");
  return res;
}

export async function updateProfileAction(fd: FormData) {
  const res = await runAction((ctx) => updateProfile(ctx.userId, { name: String(fd.get("name") ?? "") }));
  if (res.ok) revalidatePath("/", "layout");
  return res;
}

export async function changePasswordAction(fd: FormData) {
  return runAction((ctx) =>
    changePassword(ctx.userId, {
      currentPassword: String(fd.get("currentPassword") ?? ""),
      password: String(fd.get("password") ?? ""),
      confirm: String(fd.get("confirm") ?? ""),
    }),
  );
}
