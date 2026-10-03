import { requireAppContext } from "@/server/auth-context";
import { listCatalog, listEmployees } from "@/server/services/catalog";
import { getTodaySnapshot } from "@/server/services/home";
import { greetingFor } from "@/lib/domain/date-range";
import { fmtDate } from "@/lib/format";
import { HomeLive } from "@/components/sales/home-live";

export const metadata = { title: "Home" };

export default async function HomePage() {
  const ctx = await requireAppContext();
  const [catalog, employees, today] = await Promise.all([
    listCatalog(ctx, { activeOnly: true }),
    listEmployees(ctx, { activeOnly: true }),
    getTodaySnapshot(ctx),
  ]);
  const now = new Date();

  const categories = catalog.map((c) => ({
    id: c.id,
    name: c.name,
    services: c.services.map((s) => ({ id: s.id, name: s.name, priceCents: s.priceCents, durationMinutes: s.durationMinutes })),
  }));

  return (
    <div>
      <div className="mb-4 lg:mb-6">
        <h1 className="font-display text-3xl font-semibold text-ink sm:text-4xl">
          {greetingFor(now, ctx.timezone)}, {ctx.user.name}
        </h1>
        <p className="text-sm text-muted">{fmtDate(now, ctx.timezone)}</p>
      </div>
      <HomeLive
        categories={categories}
        employees={employees.map((e) => ({ id: e.id, name: e.name }))}
        initialToday={today}
        tz={ctx.timezone}
      />
    </div>
  );
}
