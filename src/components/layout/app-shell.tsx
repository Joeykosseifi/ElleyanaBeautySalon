"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { BOTTOM_ITEMS, MORE_PATHS, SIDEBAR_ITEMS, isActive } from "./nav-items";
import { logoutAction } from "@/server/actions/account";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("font-display text-2xl font-bold tracking-tight text-ink", className)}>
      Salon<span className="text-rose">Flow</span>
    </span>
  );
}

export function AppShell({
  children,
  salonName,
  userName,
  canManage,
}: {
  children: ReactNode;
  salonName: string;
  userName: string;
  canManage: boolean;
}) {
  const pathname = usePathname();
  const sidebar = SIDEBAR_ITEMS.filter((i) => canManage || !i.manage);
  const bottom = BOTTOM_ITEMS.filter((i) => canManage || !i.manage);

  return (
    <div className="min-h-dvh lg:pl-64">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-beige/70 bg-white/80 backdrop-blur lg:flex">
        <div className="px-6 pt-7 pb-6">
          <Link href="/" aria-label="SalonFlow home">
            <Logo />
          </Link>
          <p className="mt-0.5 truncate text-xs text-muted">{salonName}</p>
        </div>
        <nav className="flex-1 space-y-1 px-3" aria-label="Main">
          {sidebar.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition-colors",
                  active ? "bg-blush text-rose-dark" : "text-ink-soft hover:bg-cream hover:text-ink",
                )}
              >
                <item.icon className={cn("size-5", active ? "text-rose" : "text-muted")} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-beige/70 p-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-full bg-gold-soft font-semibold text-gold">
              {userName.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{userName}</p>
            </div>
            <form action={logoutAction}>
              <button className="rounded-lg p-2 text-muted hover:bg-cream hover:text-ink" aria-label="Log out" title="Log out">
                <LogOut className="size-4" />
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Mobile / tablet top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-beige/60 bg-canvas/90 px-4 backdrop-blur lg:hidden">
        <Link href="/" aria-label="SalonFlow home">
          <Logo className="text-xl" />
        </Link>
        <span className="max-w-[50%] truncate text-xs text-muted">{salonName}</span>
      </header>

      <main className="mx-auto w-full max-w-[1400px] px-4 pt-4 pb-28 sm:px-6 lg:px-8 lg:pt-8 lg:pb-10">{children}</main>

      {/* Mobile / tablet bottom navigation */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-beige/70 bg-white/95 pb-safe backdrop-blur lg:hidden"
      >
        <div className="mx-auto flex max-w-xl">
          {bottom.map((item) => {
            const active =
              item.href === "/more" ? MORE_PATHS.some((p) => isActive(pathname, p)) : isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-1 flex-col items-center gap-0.5 pt-2 pb-2 text-[11px] font-medium",
                  active ? "text-rose-dark" : "text-muted",
                )}
              >
                <span className={cn("flex h-7 w-12 items-center justify-center rounded-full", active && "bg-blush")}>
                  <item.icon className="size-5" />
                </span>
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
