"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "./result";
import { MANAGE_ROLES } from "../roles";
import {
  deleteCategory,
  deleteService,
  upsertCategory,
  upsertEmployee,
  upsertService,
} from "../services/catalog";

const formObject = (fd: FormData) => Object.fromEntries(fd.entries()) as Record<string, string>;

function done<T>(res: T) {
  revalidatePath("/", "layout");
  return res;
}

export async function saveCategoryAction(id: string | null, fd: FormData) {
  return done(await runAction((ctx) => upsertCategory(ctx, id, formObject(fd)), MANAGE_ROLES));
}

export async function deleteCategoryAction(id: string) {
  return done(await runAction((ctx) => deleteCategory(ctx, String(id)), MANAGE_ROLES));
}

export async function saveServiceAction(id: string | null, fd: FormData) {
  return done(await runAction((ctx) => upsertService(ctx, id, formObject(fd)), MANAGE_ROLES));
}

export async function deleteServiceAction(id: string) {
  return done(await runAction((ctx) => deleteService(ctx, String(id)), MANAGE_ROLES));
}

export async function saveEmployeeAction(id: string | null, fd: FormData) {
  return done(await runAction((ctx) => upsertEmployee(ctx, id, formObject(fd)), MANAGE_ROLES));
}
