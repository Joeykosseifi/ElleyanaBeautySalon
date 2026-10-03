import { LogOut } from "lucide-react";
import { requireAppContext } from "@/server/auth-context";
import { logoutAction } from "@/server/actions/account";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PasswordForm, ProfileForm, SalonSettingsForm } from "@/components/layout/settings-forms";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const ctx = await requireAppContext();
  const timezones = Intl.supportedValuesOf("timeZone");
  if (!timezones.includes(ctx.salon.timezone)) timezones.unshift(ctx.salon.timezone);
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title="Settings" />
      <Card>
        <CardHeader title="Salon" />
        <CardBody>
          <SalonSettingsForm name={ctx.salon.name} timezone={ctx.salon.timezone} timezones={timezones} disabled={ctx.role !== "OWNER"} />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Your profile" />
        <CardBody>
          <ProfileForm name={ctx.user.name} email={ctx.user.email} />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Password" />
        <CardBody>
          <PasswordForm />
        </CardBody>
      </Card>
      <form action={logoutAction}>
        <button className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-beige bg-white font-medium text-unpaid hover:bg-unpaid-bg">
          <LogOut className="size-4" /> Log out
        </button>
      </form>
    </div>
  );
}
