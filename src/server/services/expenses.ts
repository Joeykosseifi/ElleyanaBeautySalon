import { prisma } from "../db";
import type { ServiceContext } from "../context";
import { DomainError, NotFoundError } from "../errors";
import { expenseInputSchema } from "@/lib/validation/catalog";
import { startOfLocalDay } from "@/lib/domain/date-range";

export async function listExpenses(ctx: ServiceContext, range: { start: Date; end: Date }) {
  return prisma.expense.findMany({
    where: { salonId: ctx.salonId, date: { gte: range.start, lt: range.end } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
}

function toData(ctx: ServiceContext, raw: unknown) {
  const input = expenseInputSchema.parse(raw);
  const date = startOfLocalDay(input.date, ctx.timezone);
  if (!date) throw new DomainError("Choose a valid date.", { date: "Choose a valid date." });
  return {
    category: input.category,
    description: input.description,
    amountCents: input.amount,
    date,
    paymentMethod: input.paymentMethod,
    notes: input.notes,
  };
}

export async function createExpense(
  ctx: ServiceContext,
  raw: unknown,
  receiptUrl: string | null = null,
) {
  return prisma.expense.create({ data: { ...toData(ctx, raw), receiptUrl, salonId: ctx.salonId } });
}

export async function updateExpense(
  ctx: ServiceContext,
  id: string,
  raw: unknown,
  receipt?: { url: string | null },
) {
  const res = await prisma.expense.updateMany({
    where: { id, salonId: ctx.salonId },
    data: { ...toData(ctx, raw), ...(receipt ? { receiptUrl: receipt.url } : {}) },
  });
  if (res.count === 0) throw new NotFoundError("Expense");
}

export async function deleteExpense(ctx: ServiceContext, id: string) {
  const expense = await prisma.expense.findFirst({ where: { id, salonId: ctx.salonId } });
  if (!expense) throw new NotFoundError("Expense");
  await prisma.expense.delete({ where: { id } });
  return expense;
}
