import Link from "next/link";
import { cn } from "@/lib/utils";

/** Server-rendered filter pills that are plain links (work without JS). */
export function LinkChips({ items }: { items: { href: string; label: string; active: boolean; count?: number }[] }) {
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-none">
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          scroll={false}
          aria-current={i.active ? "true" : undefined}
          className={cn(
            "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium whitespace-nowrap",
            i.active ? "border-ink bg-ink text-white" : "border-beige bg-white text-ink-soft hover:bg-cream",
          )}
        >
          {i.label}
          {i.count !== undefined && <span className={i.active ? "opacity-70" : "text-muted"}>{i.count}</span>}
        </Link>
      ))}
    </div>
  );
}
