import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe Auth.js configuration (no database / bcrypt imports) shared by the
 * middleware and the full server configuration in `auth.ts`.
 */
export const PUBLIC_PATHS = ["/login", "/forgot-password", "/reset-password"];

export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 14 },
  trustHost: true,
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
      const isLoggedIn = Boolean(auth?.user);
      if (isPublic) {
        if (isLoggedIn && pathname === "/login") return Response.redirect(new URL("/", request.nextUrl));
        return true;
      }
      return isLoggedIn;
    },
    jwt({ token, user }) {
      if (user) {
        const u = user as { id?: string; salonId?: string; role?: string };
        token.uid = u.id;
        token.salonId = u.salonId;
        token.role = u.role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        Object.assign(session.user, {
          id: token.uid as string,
          salonId: token.salonId as string,
          role: token.role as string,
        });
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
