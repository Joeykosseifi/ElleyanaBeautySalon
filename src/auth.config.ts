import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe Auth.js configuration (no database / bcrypt imports) shared by the
 * middleware and the full server configuration in `auth.ts`.
 *
 * The middleware only checks that a correctly signed session cookie is present.
 * Whether that session is still valid (not logged out / revoked / expired) is
 * checked against the database on every page and action (see auth-context.ts).
 */
export const PUBLIC_PATHS = ["/login", "/setup", "/forgot-password", "/reset-password"];

/** 30 days. Must match SESSION_MAX_AGE_SECONDS in server/services/auth.ts. */
const SESSION_MAX_AGE = 30 * 24 * 60 * 60;

export const authConfig = {
  pages: { signIn: "/login" },
  // Persistent cookie (Expires = now + 30 days), re-issued at most daily while in use.
  // Auth.js sets it HttpOnly, SameSite=Lax, Path=/, and Secure whenever the app is
  // served over HTTPS. Nothing auth-related is ever stored in localStorage.
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE, updateAge: 24 * 60 * 60 },
  trustHost: true,
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
      // Public pages decide for themselves (e.g. /login sends a valid session home, /setup
      // closes itself once an owner exists) — they can check the database, the edge can't.
      if (isPublic) return true;
      return Boolean(auth?.user);
    },
    jwt({ token, user }) {
      if (user) {
        const u = user as { id?: string; sid?: string };
        token.uid = u.id;
        token.sid = u.sid; // AuthSession row id — revocable server-side
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        Object.assign(session.user, { id: token.uid as string, sid: token.sid as string });
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
