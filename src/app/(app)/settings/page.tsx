import { LogOut } from "lucide-react";
import { requireAppContext } from "@/server/auth-context";
import { countLoginAccounts, isSetupTokenStillSet } from "@/server/services/auth";
import { logoutAction } from "@/server/actions/account";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmailForm, PasswordForm, ProfileForm, SalonSettingsForm } from "@/components/layout/settings-forms";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const ctx = await requireAppContext();
  const loginAccounts = await countLoginAccounts();
  const timezones = Intl.supportedValuesOf("timeZone");
  if (!timezones.includes(ctx.salon.timezone)) timezones.unshift(ctx.salon.timezone);
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title="Settings" />
      {loginAccounts > 1 && (
        <p role="alert" className="rounded-2xl border border-unpaid/30 bg-unpaid-bg p-4 text-sm text-ink">
          This database has {loginAccounts} login accounts, but SalonFlow should have only one: yours. An older one (for example the demo
          login) may still work. On the computer running SalonFlow, run <code>npm run accounts:check</code>, then{" "}
          <code>npm run accounts:keep-only -- your@email --confirm</code>. Salon records are not affected.
        </p>
      )}
      {ctx.role === "OWNER" && isSetupTokenStillSet() && (
        <p role="status" className="rounded-2xl border border-partial/40 bg-partial-bg p-4 text-sm text-ink">
          Setup is complete. Remove <code>SALON_SETUP_TOKEN</code> from the server environment. It is no longer needed and can&apos;t create
          another account.
        </p>
      )}
      <Card>
        <CardHeader title="Salon" />
        <CardBody>
          <SalonSettingsForm name={ctx.salon.name} timezone={ctx.salon.timezone} timezones={timezones} disabled={ctx.role !== "OWNER"} />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Your profile" />
        <CardBody>
          <ProfileForm name={ctx.user.name} />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Login email" description="Changing it signs you out on your other devices." />
        <CardBody>
          <EmailForm email={ctx.user.email} />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Password" description="Changing it signs you out on your other devices." />
        <CardBody>
          <PasswordForm />
        </CardBody>
      </Card>
      <form action={logoutAction}>
        <button className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-beige bg-white font-medium text-unpaid hover:bg-unpaid-bg">
          <LogOut className="size-4" /> Log out
        </button>
      </form>
      <p className="text-center text-xs text-muted">
        You stay signed in on this device for up to 30 days, even after closing the browser. Log out on shared devices.
      </p>
    </div>
  );
}
