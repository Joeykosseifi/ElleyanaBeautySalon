"use client";

import { Chip } from "@/components/ui/chip";
import type { QuickEmployee } from "./types";

export function EmployeeSelector({
  employees,
  value,
  onChange,
}: {
  employees: QuickEmployee[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  if (employees.length === 0) {
    return <p className="text-sm text-muted">No active employees. Add them under Employees.</p>;
  }
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-none" role="radiogroup" aria-label="Employee">
      {employees.map((e) => (
        <Chip key={e.id} role="radio" aria-checked={value === e.id} selected={value === e.id} onClick={() => onChange(value === e.id && employees.length > 1 ? null : e.id)}>
          {e.name}
        </Chip>
      ))}
    </div>
  );
}
