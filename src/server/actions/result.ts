import "server-only";
import { ZodError } from "zod";
import { DomainError } from "../errors";
import { describeError } from "../log";
import { getAppContext, type AppContext } from "../auth-context";

export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

function zodFieldErrors(err: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/**
 * Wrap a server action: requires a signed-in user, converts validation and domain
 * errors into friendly messages, and hides unexpected errors from the browser.
 */
export async function runAction<T>(fn: (ctx: AppContext) => Promise<T>, roles?: AppContext["role"][]): Promise<ActionResult<T>> {
  const ctx = await getAppContext();
  if (!ctx) return { ok: false, error: "Your session has expired. Please log in again." };
  if (roles && !roles.includes(ctx.role)) return { ok: false, error: "You don't have permission to do that." };
  try {
    return { ok: true, data: await fn(ctx) };
  } catch (err) {
    if (err instanceof ZodError) {
      const fieldErrors = zodFieldErrors(err);
      return { ok: false, error: Object.values(fieldErrors)[0] ?? "Please check the form.", fieldErrors };
    }
    if (err instanceof DomainError) return { ok: false, error: err.message, fieldErrors: err.fieldErrors };
    console.error("[action] unexpected error:", describeError(err));
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
