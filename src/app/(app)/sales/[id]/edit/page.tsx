import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAppContext } from "@/server/auth-context";
import { getSaleForEdit } from "@/server/services/sale-edit";
import { listCatalog, listEmployees } from "@/server/services/catalog";
import { toLocalDateTimeInput } from "@/lib/domain/date-range";
import { EditSaleForm } from "@/components/sales/edit-sale-form";

export const metadata = { title: "Edit sale" };

/** Edit Sale — owner only. The server action re-checks the role, the version and every value. */
export default async function EditSalePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAppContext();
  const { id } = await params;
  if (ctx.role !== "OWNER") redirect(`/sales/${id}`);
  const [sale, catalog, employees] = await Promise.all([
    getSaleForEdit(ctx, id),
    listCatalog(ctx, { activeOnly: true }),
    listEmployees(ctx),
  ]);
  if (!sale) notFound();
  if (sale.isVoided) redirect(`/sales/${id}`);

  const categories = catalog.map((c) => ({
    id: c.id,
    name: c.name,
    services: c.services.map((s) => ({ id: s.id, name: s.name, priceCents: s.priceCents, durationMinutes: s.durationMinutes })),
  }));

  return (
    <div className="mx-auto max-w-4xl">
      <Link href={`/sales/${id}`} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Back to sale
      </Link>
      <EditSaleForm
        sale={sale}
        categories={categories}
        employees={employees.map((e) => ({ id: e.id, name: e.name, active: e.active }))}
        maxDate={toLocalDateTimeInput(new Date(), ctx.timezone)}
      />
    </div>
  );
}
