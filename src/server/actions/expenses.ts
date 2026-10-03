"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "./result";
import { MANAGE_ROLES } from "../roles";
import { createExpense, deleteExpense, updateExpense } from "../services/expenses";
import { deleteReceipt, saveReceipt } from "../services/receipts";
import { prisma } from "../db";
import { expenseInputSchema } from "@/lib/validation/catalog";

export async function saveExpenseAction(id: string | null, fd: FormData) {
  const res = await runAction(async (ctx) => {
    const fields = Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;
    // Validate before touching the disk so a bad form never leaves an orphaned file.
    expenseInputSchema.parse(fields);
    const file = fd.get("receipt");
    const hasFile = file instanceof File && file.size > 0;
    const removeReceipt = fields.removeReceipt === "true";
    const previous = id
      ? await prisma.expense.findFirst({ where: { id, salonId: ctx.salonId }, select: { receiptUrl: true } })
      : null;
    const url = hasFile ? await saveReceipt(ctx.salonId, file) : null;
    try {
      if (id) {
        await updateExpense(ctx, id, fields, hasFile || removeReceipt ? { url } : undefined);
        if ((hasFile || removeReceipt) && previous?.receiptUrl) await deleteReceipt(previous.receiptUrl);
      } else {
        await createExpense(ctx, fields, url);
      }
    } catch (err) {
      await deleteReceipt(url);
      throw err;
    }
  }, MANAGE_ROLES);
  if (res.ok) revalidatePath("/expenses");
  return res;
}

export async function deleteExpenseAction(id: string) {
  const res = await runAction(async (ctx) => {
    const expense = await deleteExpense(ctx, String(id));
    await deleteReceipt(expense.receiptUrl);
  }, MANAGE_ROLES);
  if (res.ok) revalidatePath("/expenses");
  return res;
}
