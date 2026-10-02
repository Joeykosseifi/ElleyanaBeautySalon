"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "./result";
import { addPayment, createSale } from "../services/sales";
import { searchClients } from "../services/clients";
import type { AddPaymentInput, CreateSaleInput } from "@/lib/validation/sale";

export async function createSaleAction(input: CreateSaleInput) {
  const res = await runAction((ctx) => createSale(ctx, input));
  if (res.ok) revalidatePath("/", "layout");
  return res;
}

export async function addPaymentAction(input: AddPaymentInput) {
  const res = await runAction((ctx) => addPayment(ctx, input));
  if (res.ok) revalidatePath("/", "layout");
  return res;
}

export async function searchClientsAction(q: string) {
  return runAction((ctx) => searchClients(ctx, String(q ?? "").slice(0, 100)));
}
