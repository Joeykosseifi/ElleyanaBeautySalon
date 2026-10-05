import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./auth.config";
import { createAuthSession, verifyCredentials } from "./server/services/auth";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw, request) {
        const user = await verifyCredentials(raw);
        if (!user) return null;
        // Every successful login gets its own server-side session row.
        const session = await createAuthSession(user.id, request?.headers?.get("user-agent"));
        return { id: user.id, name: user.name, email: user.email, sid: session.id };
      },
    }),
  ],
});
