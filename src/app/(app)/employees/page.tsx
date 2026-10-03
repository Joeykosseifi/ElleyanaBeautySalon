import Link from "next/link";
import { UserRound } from "lucide-react";
import { requireManager } from "@/server/auth-context";
import { listEmployees } from "@/server/services/catalog";
import { formatMoney, formatPercent } from "@/lib/domain/money";
import { PageHeader } from "@/components/layout/page-header";
import { EmployeeFormButton } from "@/components/employees/employee-form";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "Employees" };

export default async function EmployeesPage() {
  const ctx = await requireManager();
  const employees = await listEmployees(ctx);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Employees"
        description={
          <>
            Who performs services. See each person&apos;s numbers in{" "}
            <Link href="/reports" className="font-medium text-rose">
              Reports
            </Link>
            .
          </>
        }
        actions={<EmployeeFormButton />}
      />
      <Card className="overflow-hidden">
        {employees.length === 0 ? (
          <EmptyState icon={UserRound} title="No employees yet." description="Add the people who perform services so sales can be assigned to them." />
        ) : (
          <ul className="divide-y divide-beige/60">
            {employees.map((e) => (
              <li key={e.id} className={`flex items-center gap-3 px-5 py-3.5 sm:px-6 ${e.active ? "" : "opacity-60"}`}>
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gold-soft font-semibold text-gold">
                  {e.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink">
                    {e.name}
                    {!e.active && <span className="ml-2 rounded-full bg-cream px-2 py-0.5 text-xs font-normal text-muted">Inactive</span>}
                  </p>
                  <p className="truncate text-sm text-muted">{[e.role, e.phone].filter(Boolean).join(" · ") || "—"}</p>
                </div>
                <span className="hidden text-sm text-ink-soft sm:block">
                  {e.commissionType === "PERCENTAGE"
                    ? `${formatPercent(e.commissionValue)} commission`
                    : e.commissionType === "FIXED"
                      ? `${formatMoney(e.commissionValue)} / service`
                      : "No commission"}
                </span>
                <EmployeeFormButton
                  employee={{
                    id: e.id,
                    name: e.name,
                    phone: e.phone,
                    role: e.role,
                    active: e.active,
                    commissionType: e.commissionType,
                    commissionValue: e.commissionValue,
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
