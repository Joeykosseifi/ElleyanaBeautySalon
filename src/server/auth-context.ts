import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import type { ServiceContext } from "./context";
import { validateAuthSession } from "./services/auth";

export interface AppContext extends ServiceContext {
  userId: string;
  /** Server-side session id of this browser (AuthSession row). */
  sessionId: string;
  role: "OWNER" | "MANAGER" | "STAFF";
  user: { id: string; name: string; email: string };
  salon: { id: string; name: string; timezone: string; currency: string };
}

/**
 * Resolve the signed-in user from the session cookie and re-check the session row
 * in the database: a logged-out, revoked or expired session — or a deleted user —
 * gets no access even if the signed cookie is still present. Cached per request.
 */
export const getAppContext = cache(async (): Promise<AppContext | null> => {
  const session = await auth();
  const u = session?.user as { id?: string; sid?: string } | undefined;
  const user = await validateAuthSession(u?.sid, u?.id);
  if (!user || !u?.sid) return null;
  return {
    userId: user.id,
    sessionId: u.sid,
    salonId: user.salonId,
    timezone: user.salon.timezone,
    role: user.role,
    user: { id: user.id, name: user.name, email: user.email },
    salon: { id: user.salon.id, name: user.salon.name, timezone: user.salon.timezone, currency: user.salon.currency },
  };
});

/** For pages: redirect to the login screen when there is no valid session. */
export async function requireAppContext(): Promise<AppContext> {
  const ctx = await getAppContext();
  if (!ctx) redirect("/login");
  return ctx;
}

/** For owner / manager-only pages. Staff are sent back to Home. */
export async function requireManager(): Promise<AppContext> {
  const ctx = await requireAppContext();
  if (ctx.role === "STAFF") redirect("/");
  return ctx;
}
