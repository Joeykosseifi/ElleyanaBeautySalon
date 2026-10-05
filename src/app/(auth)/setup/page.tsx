import { redirect } from "next/navigation";
import { SetupOwnerForm } from "@/components/auth/forms";
import { isSetupRequired, isSetupTokenConfigured, SETUP_TOKEN_MIN_LENGTH } from "@/server/services/auth";

export const metadata = { title: "Create owner account" };
export const dynamic = "force-dynamic";

/** First-run only: closed for good once an owner exists (also enforced in the action). */
export default async function SetupPage() {
  if (!(await isSetupRequired())) redirect("/login");
  // Only a yes/no reaches the browser — never the token itself.
  if (!isSetupTokenConfigured()) {
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-semibold text-ink">Setup is locked</h1>
        <p className="text-sm text-ink-soft">
          To create the owner account, the person deploying SalonFlow must first set a one-time setup token on the server:
        </p>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-soft">
          <li>
            Generate one, e.g. <code className="rounded bg-cream px-1">openssl rand -base64 32</code> (at least {SETUP_TOKEN_MIN_LENGTH} characters).
          </li>
          <li>
            Set it as <code className="rounded bg-cream px-1">SALON_SETUP_TOKEN</code> in the server environment and restart SalonFlow.
          </li>
          <li>Reload this page and enter the token with the owner&apos;s details.</li>
        </ol>
        <p className="text-sm text-muted">This is not the owner&apos;s password. Remove it from the environment once setup is done.</p>
      </div>
    );
  }
  return <SetupOwnerForm />;
}
