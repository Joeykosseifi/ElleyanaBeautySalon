"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Select } from "@/components/ui/form";
import { Spinner } from "@/components/ui/spinner";
import { nudgeAfterMutation } from "@/components/ui/render-nudge";

type Option = { value: string; label: string };

/** Service / category / employee menus for Services Performed; each change updates the URL. */
export function ActivityFilters({
  service,
  category,
  employee,
  services,
  categories,
  employees,
}: {
  service: string;
  category: string;
  employee: string;
  services: Option[];
  categories: Option[];
  employees: Option[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const set = (key: string, value: string) => {
    const sp = new URLSearchParams(params.toString());
    if (value) sp.set(key, value);
    else sp.delete(key);
    startTransition(() => router.replace(`${pathname}?${sp.toString()}`, { scroll: false }));
    nudgeAfterMutation(); // see render-nudge.tsx: query-only navigations can stall otherwise
  };

  const menu = (id: string, label: string, value: string, all: string, options: Option[]) => (
    <label htmlFor={id} className="block min-w-0 text-xs font-medium text-muted">
      {label}
      <Select id={id} value={value} onChange={(e) => set(id, e.target.value)} className="mt-1 w-full">
        <option value="">{all}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </label>
  );

  return (
    <div className="relative grid grid-cols-2 gap-3 sm:grid-cols-3">
      <div className="col-span-2 sm:col-span-1">{menu("service", "Service", service, "All services", services)}</div>
      {menu("category", "Category", category, "All categories", categories)}
      {menu("employee", "Employee", employee, "All employees", employees)}
      {pending && <Spinner className="absolute -top-1 right-0 size-4 text-muted" />}
    </div>
  );
}
