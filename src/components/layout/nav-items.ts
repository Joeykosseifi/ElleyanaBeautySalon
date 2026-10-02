import {
  BarChart3,
  Home,
  MoreHorizontal,
  Receipt,
  Scissors,
  Settings,
  UserRound,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Only shown to owners / managers */
  manage?: boolean;
}

export const SIDEBAR_ITEMS: NavItem[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/sales", label: "Sales", icon: Receipt },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/reports", label: "Reports", icon: BarChart3, manage: true },
  { href: "/services", label: "Services", icon: Scissors, manage: true },
  { href: "/expenses", label: "Expenses", icon: Wallet, manage: true },
  { href: "/employees", label: "Employees", icon: UserRound, manage: true },
  { href: "/settings", label: "Settings", icon: Settings },
];

export const BOTTOM_ITEMS: NavItem[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/sales", label: "Sales", icon: Receipt },
  { href: "/reports", label: "Reports", icon: BarChart3, manage: true },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/more", label: "More", icon: MoreHorizontal },
];

/** Pages reachable from the mobile "More" tab — it is highlighted when one is open. */
export const MORE_PATHS = ["/more", "/services", "/expenses", "/employees", "/settings"];

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
