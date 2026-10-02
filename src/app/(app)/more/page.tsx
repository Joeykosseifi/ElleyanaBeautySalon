import Link from "next/link";
import { ChevronRight, LogOut, Scissors, Settings, UserRound, Wallet } from "lucide-react";
import { requireAppContext } from "@/server/auth-context";
import { canManage } from "@/server/roles";
import { logoutAction } from "@/server/actions/account";
import { PageHeader } from "@/components/layout/page-header";

export const metadata = { title: "More" };

const ITEMS = [
  { href: "/services", label: "Services", description: "Menu, prices and categories", icon: Scissors, manage: true },
  { href: "/expenses", label: "Expenses", description: "Rent, products and bills", icon: Wallet, manage: true },
  { href: "/employees", label: "Employees", description: "Team and commissions", icon: UserRound, manage: true },
  { href: "/settings", label: "Settings", description: "Salon, profile and password", icon: Settings, manage: false },
];

export default async function MorePage() {
  const ctx = await requireAppContext();
  const items = ITEMS.filter((i) => !i.manage || canManage(ctx.role));
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="More" />
      <ul className="overflow-hidden rounded-3xl border border-beige/70 bg-white shadow-soft">
        {items.map((i) => (
          <li key={i.href} className="border-b border-beige/60 last:border-0">
            <Link href={i.href} className="flex items-center gap-4 px-5 py-4 hover:bg-cream/60">
              <span className="flex size-11 items-center justify-center rounded-2xl bg-blush text-rose">
                <i.icon className="size-5" />
              </span>
              <span className="flex-1">
                <span className="block font-semibold text-ink">{i.label}</span>
                <span className="block text-sm text-muted">{i.description}</span>
              </span>
              <ChevronRight className="size-5 text-sand" />
            </Link>
          </li>
        ))}
      </ul>
      <form action={logoutAction} className="mt-5">
        <button className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-beige bg-white font-medium text-unpaid hover:bg-unpaid-bg">
          <LogOut className="size-4" /> Log out
        </button>
      </form>
    </div>
  );
}
