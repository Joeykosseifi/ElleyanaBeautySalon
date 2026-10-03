import { AppShell } from "@/components/layout/app-shell";
import { requireAppContext } from "@/server/auth-context";
import { canManage } from "@/server/roles";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireAppContext();
  return (
    <AppShell salonName={ctx.salon.name} userName={ctx.user.name} canManage={canManage(ctx.role)}>
      {children}
    </AppShell>
  );
}
