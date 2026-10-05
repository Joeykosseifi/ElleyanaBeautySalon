import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/reports", label: "Money" },
  { href: "/reports/services", label: "Services Performed" },
] as const;

/** Switch between the money report and the service-count report. */
export function ReportsTabs({ active }: { active: (typeof TABS)[number]["href"] }) {
  return (
    <nav aria-label="Report type" className="mb-5 inline-flex rounded-2xl border border-beige bg-white p-1 shadow-soft">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={active === t.href ? "page" : undefined}
          className={cn(
            "rounded-xl px-4 py-2 text-sm font-medium whitespace-nowrap",
            active === t.href ? "bg-ink text-white" : "text-ink-soft hover:bg-cream",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
