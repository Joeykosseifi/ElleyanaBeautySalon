"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "./result";
import { describeError } from "../log";
import { MANAGE_ROLES } from "../roles";
import { addPayment, createSale, voidSale } from "../services/sales";
import { searchClients } from "../services/clients";
import { getTodaySnapshot } from "../services/home";
import type { AddPaymentInput, CreateSaleInput, VoidSaleInput } from "@/lib/validation/sale";

/**
 * Complete Sale. Returns the saved sale AND the refreshed Today panel in a single
 * response, so the Home screen updates without a router refresh or a re-render of
 * the whole page.
 *
 * Refresh design for all actions: every page reads live data (nothing is cached on the
 * server), so other screens are rendered fresh when opened. The screen that made the
 * change is refreshed exactly once, inside the same response — Complete Sale via the
 * Today snapshot below; other actions by revalidating only their own page, which makes
 * Next.js return that page's fresh render with the action result. No client-side
 * router.refresh() follows (that was the second, redundant render).
 */
export async function createSaleAction(input: CreateSaleInput) {
  return runAction(async (ctx) => {
    const sale = await createSale(ctx, input);
    // The sale is committed at this point; if the summary query fails, the client
    // falls back to a refresh rather than reporting the sale as failed.
    const today = await getTodaySnapshot(ctx).catch((err) => {
      console.error("[createSale] today snapshot failed:", describeError(err));
      return null;
    });
    return { sale, today };
  });
}

/** Payments and voids are made from the sale detail page or a client profile. */
function refreshSalePages() {
  revalidatePath("/sales/[id]", "page");
  revalidatePath("/clients/[id]", "page");
}

export async function addPaymentAction(input: AddPaymentInput) {
  const res = await runAction((ctx) => addPayment(ctx, input));
  if (res.ok) refreshSalePages();
  return res;
}

export async function voidSaleAction(input: VoidSaleInput) {
  const res = await runAction((ctx) => voidSale(ctx, input), MANAGE_ROLES);
  if (res.ok) refreshSalePages();
  return res;
}

export async function searchClientsAction(q: string) {
  return runAction((ctx) => searchClients(ctx, String(q ?? "").slice(0, 100)));
}
