import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { authConfig } from "./auth.config";
import { prisma } from "./server/db";
import { loginSchema } from "./lib/validation/auth";

const DUMMY_HASH = bcrypt.hashSync("salonflow-timing-guard", 10);

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = loginSchema.safeParse(raw);
        if (!parsed.success) return null;
        const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
        // Always run bcrypt so response time doesn't reveal whether the email exists.
        const hash = user?.passwordHash ?? DUMMY_HASH;
        const valid = await bcrypt.compare(parsed.data.password, hash);
        if (!user || !valid) return null;
        return { id: user.id, name: user.name, email: user.email, salonId: user.salonId, role: user.role };
      },
    }),
  ],
});
