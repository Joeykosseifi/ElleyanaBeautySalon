"use server";

import { AuthError } from "next-auth";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { auth, signIn, signOut } from "@/auth";
import { runAction, type ActionResult } from "./result";
import { requestPasswordReset, resetPassword, updateProfile, updateSalonSettings } from "../services/account";
import { changeEmail, changePassword, createInitialOwner, revokeAuthSession } from "../services/auth";
import { DomainError } from "../errors";
import { describeError } from "../log";

// Server actions are POST-only and Next.js rejects calls whose Origin doesn't match
// the Host, which protects every action here against CSRF.

function formError(err: unknown): ActionResult | null {
  if (err instanceof DomainError) return { ok: false, error: err.message, fieldErrors: err.fieldErrors };
  if (err instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const i of err.issues) fieldErrors[i.path.join(".") || "_"] ??= i.message;
    return { ok: false, error: err.issues[0]?.message ?? "Please check the form.", fieldErrors };
  }
  return null;
}

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

/**
 * First-run setup: creates the one initial OWNER account, then signs it in.
 * The service checks the SALON_SETUP_TOKEN and refuses (server-side) as soon as any
 * owner exists. The submitted token is never logged or echoed back.
 */
export async function setupOwnerAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const email = String(fd.get("email") ?? "");
  const password = String(fd.get("password") ?? "");
  try {
    await createInitialOwner({
      setupToken: String(fd.get("setupToken") ?? ""),
      name: String(fd.get("name") ?? ""),
      email,
      password,
      confirm: String(fd.get("confirm") ?? ""),
    });
  } catch (err) {
    const res = formError(err);
    if (res) return res;
    console.error("[setup] owner creation failed:", describeError(err));
    return { ok: false, error: "Something went wrong. Please try again." };
  }
  console.info("[setup] Owner account created. Remove SALON_SETUP_TOKEN from the server environment now.");
  try {
    await signIn("credentials", { email, password, redirectTo: "/" });
  } catch (err) {
    if (err instanceof AuthError) return { ok: true, data: undefined, message: "Account created. Please log in." };
    throw err; // Next.js redirect to Home on success
  }
  return { ok: true, data: undefined };
}

/** Logout revokes this browser's session server-side, then clears the cookie. */
export async function logoutAction() {
  const session = await auth();
  await revokeAuthSession((session?.user as { sid?: string } | undefined)?.sid);
  await signOut({ redirectTo: "/login" });
}

export async function forgotPasswordAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const link = await requestPasswordReset(String(fd.get("email") ?? ""), appUrl);
  if (link) {
    // No email provider is configured yet, so the one-time link (valid 1 hour) is
    // written to the server's own console — only someone with access to the machine
    // running SalonFlow can read it. Replace this with an email service when available.
    console.info(`[password-reset] A reset link was requested. Open within 1 hour: ${link}`);
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
    const res = formError(err);
    if (res) return res;
    throw err;
  }
}

export async function updateSalonAction(fd: FormData) {
  const res = await runAction(
    (ctx) => updateSalonSettings(ctx, { name: String(fd.get("name") ?? ""), timezone: String(fd.get("timezone") ?? "") }),
    ["OWNER"],
  );
  // The salon name is shown in the app shell (layout), so the layout must refresh.
  if (res.ok) revalidatePath("/", "layout");
  return res;
}

export async function updateProfileAction(fd: FormData) {
  const res = await runAction((ctx) => updateProfile(ctx.userId, { name: String(fd.get("name") ?? "") }));
  // The user's name is shown in the app shell (layout).
  if (res.ok) revalidatePath("/", "layout");
  return res;
}

/** Change login email — current password required; other devices are signed out. */
export async function changeEmailAction(fd: FormData) {
  const res = await runAction((ctx) =>
    changeEmail(
      { userId: ctx.userId, sessionId: ctx.sessionId },
      { currentPassword: String(fd.get("currentPassword") ?? ""), newEmail: String(fd.get("newEmail") ?? "") },
    ),
  );
  if (res.ok) revalidatePath("/settings");
  return res;
}

/** Change password — current password required; other devices are signed out. */
export async function changePasswordAction(fd: FormData) {
  return runAction((ctx) =>
    changePassword(
      { userId: ctx.userId, sessionId: ctx.sessionId },
      {
        currentPassword: String(fd.get("currentPassword") ?? ""),
        password: String(fd.get("password") ?? ""),
        confirm: String(fd.get("confirm") ?? ""),
      },
    ),
  );
}
