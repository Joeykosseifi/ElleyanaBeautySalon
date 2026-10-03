"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "./result";
import { createClient, updateClient } from "../services/clients";
import type { ClientInput } from "@/lib/validation/client";

export async function createClientAction(input: ClientInput) {
  return runAction(async (ctx) => {
    const c = await createClient(ctx, input);
    return { id: c.id, firstName: c.firstName, lastName: c.lastName, phone: c.phone };
  });
}

export async function updateClientAction(id: string, input: ClientInput) {
  const res = await runAction((ctx) => updateClient(ctx, String(id), input));
  if (res.ok) revalidatePath("/clients/[id]", "page");
  return res;
}
