import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./auth.config";
import { authenticate, createAuthSession, revokeAuthSession } from "./server/services/auth";
import { clientIp } from "./server/services/throttle";

/** Login refused because of too many failed attempts (the form shows a wait message). */
export class TooManyLoginAttempts extends CredentialsSignin {
  code = "rate_limited";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      // The only way to sign in. There is no sign-up: the single owner account is
      // created once on the first-run /setup screen.
      async authorize(raw, request) {
        const result = await authenticate(raw, { ip: clientIp(request?.headers) });
        if (!result.ok) {
          if (result.reason === "rate_limited") throw new TooManyLoginAttempts();
          return null;
        }
        const { user } = result;
        // Every successful login gets its own server-side session row.
        const session = await createAuthSession(user.id, request?.headers?.get("user-agent"));
        return { id: user.id, name: user.name, email: user.email, sid: session.id };
      },
    }),
  ],
  events: {
    // Any sign-out — the Logout button or Auth.js's own /api/auth/signout endpoint —
    // revokes the server-side session, not just the cookie.
    async signOut(message) {
      const token = "token" in message ? message.token : null;
      await revokeAuthSession((token as { sid?: string } | null)?.sid);
    },
  },
});
