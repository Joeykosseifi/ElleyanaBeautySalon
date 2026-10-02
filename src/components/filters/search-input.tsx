"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Search, X } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/** Search box that keeps its value in the URL (?q=) so results are shareable and survive refresh. */
export function SearchInput({ placeholder, className, paramName = "q" }: { placeholder: string; className?: string; paramName?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get(paramName) ?? "");
  const [pending, startTransition] = useTransition();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => {
      const sp = new URLSearchParams(params.toString());
      if (value.trim()) sp.set(paramName, value.trim());
      else sp.delete(paramName);
      startTransition(() => router.replace(`${pathname}?${sp.toString()}`, { scroll: false }));
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-11 w-full rounded-xl border border-beige bg-white pr-10 pl-10 text-[15px] placeholder:text-muted/70 focus:border-rose focus:ring-2 focus:ring-rose/20 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      <span className="absolute top-1/2 right-3 -translate-y-1/2">
        {pending ? (
          <Spinner className="size-4 text-muted" />
        ) : value ? (
          <button type="button" onClick={() => setValue("")} aria-label="Clear search" className="text-muted hover:text-ink">
            <X className="size-4" />
          </button>
        ) : null}
      </span>
    </div>
  );
}
