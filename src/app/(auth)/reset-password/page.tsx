import Link from "next/link";
import { ResetPasswordForm } from "@/components/auth/forms";

export const metadata = { title: "Reset password" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!token) {
    return (
      <div className="space-y-3 text-center text-sm text-ink-soft">
        <p>This reset link is missing its token.</p>
        <Link href="/forgot-password" className="font-medium text-rose">
          Request a new link
        </Link>
      </div>
    );
  }
  return <ResetPasswordForm token={token} />;
}
