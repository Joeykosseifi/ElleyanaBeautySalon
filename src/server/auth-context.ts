import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "./db";
import type { ServiceContext } from "./context";

export interface AppContext extends ServiceContext {
  userId: string;
  role: "OWNER" | "MANAGER" | "STAFF";
  user: { id: string; name: string; email: string };
  salon: { id: string; name: string; timezone: string; currency: string };
}

/**
 * Resolve the signed-in user from the session and re-check them against the
 * database (so a deleted user's still-valid cookie gives no access). Cached per request.
 */
export const getAppContext = cache(async (): Promise<AppContext | null> => {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return null;
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { salon: true } });
  if (!user) return null;
  return {
    userId: user.id,
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
