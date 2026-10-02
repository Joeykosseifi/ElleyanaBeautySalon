"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FolderPlus, Pencil, Plus, Scissors, Search, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { centsToInput, formatMoney } from "@/lib/domain/money";
import { deleteCategoryAction, deleteServiceAction, saveCategoryAction, saveServiceAction } from "@/server/actions/catalog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox, Field, FormError, Input, MoneyInput, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";

interface Service {
  id: string;
  name: string;
  categoryId: string;
  priceCents: number;
  estimatedCostCents: number;
  durationMinutes: number | null;
  active: boolean;
  notes: string | null;
  sortOrder: number;
}
interface Category {
  id: string;
  name: string;
  active: boolean;
  sortOrder: number;
  services: Service[];
}

type Editing =
  | { kind: "service"; service: Service | null; categoryId?: string }
  | { kind: "category"; category: Category | null }
  | null;

export function ServicesManager({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Editing>(null);
  const [confirm, setConfirm] = useState<{ kind: "service" | "category"; id: string; name: string } | null>(null);
  const [deleting, startDelete] = useTransition();

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return categories;
    return categories
      .map((c) => ({ ...c, services: c.services.filter((s) => s.name.toLowerCase().includes(term)) }))
      .filter((c) => c.services.length > 0 || c.name.toLowerCase().includes(term));
  }, [categories, q]);

  const doDelete = () => {
    if (!confirm) return;
    startDelete(async () => {
      const res = confirm.kind === "service" ? await deleteServiceAction(confirm.id) : await deleteCategoryAction(confirm.id);
      if (!res.ok) toast({ tone: "error", title: "Could not delete", description: res.error });
      else if (confirm.kind === "service" && res.data && typeof res.data === "object" && "deactivated" in res.data && res.data.deactivated)
        toast({ tone: "info", title: `${confirm.name} was marked inactive.`, description: "It has past sales, so it is kept for history." });
      else toast({ tone: "success", title: `${confirm.name} deleted.` });
      setConfirm(null);
      router.refresh();
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:w-80">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search services…" className="pl-10" aria-label="Search services" />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setEditing({ kind: "category", category: null })}>
            <FolderPlus className="size-4" /> Category
          </Button>
          <Button onClick={() => setEditing({ kind: "service", service: null })} disabled={categories.length === 0}>
            <Plus className="size-4" /> Service
          </Button>
        </div>
      </div>

      {categories.length === 0 ? (
        <Card>
          <EmptyState
            icon={Scissors}
            title="No categories yet."
            description="Create categories like Nails, Hair, Face and Laser, then add your services."
            action={<Button onClick={() => setEditing({ kind: "category", category: null })}>Add category</Button>}
          />
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState icon={Search} title="No services found." description={`Nothing matches “${q}”.`} />
        </Card>
      ) : (
        filtered.map((c) => (
          <Card key={c.id} className="overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-beige/70 px-5 py-3.5 sm:px-6">
              <div className="flex items-center gap-2">
                <h2 className="font-display text-xl font-semibold">{c.name}</h2>
                {!c.active && <span className="rounded-full bg-cream px-2 py-0.5 text-xs text-muted">Hidden</span>}
                <span className="text-sm text-muted">{c.services.length}</span>
              </div>
              <div className="flex gap-1">
                <IconBtn label={`Add service to ${c.name}`} onClick={() => setEditing({ kind: "service", service: null, categoryId: c.id })}>
                  <Plus className="size-4" />
                </IconBtn>
                <IconBtn label={`Edit ${c.name}`} onClick={() => setEditing({ kind: "category", category: c })}>
                  <Pencil className="size-4" />
                </IconBtn>
                <IconBtn label={`Delete ${c.name}`} onClick={() => setConfirm({ kind: "category", id: c.id, name: c.name })}>
                  <Trash2 className="size-4" />
                </IconBtn>
              </div>
            </div>
            {c.services.length === 0 ? (
              <p className="px-6 py-4 text-sm text-muted">No services in this category.</p>
            ) : (
              <ul className="divide-y divide-beige/60">
                {c.services.map((s) => (
                  <li key={s.id} className={cn("flex items-center gap-3 px-5 py-3 sm:px-6", !s.active && "opacity-60")}>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-ink">
                        {s.name}
                        {!s.active && <span className="ml-2 rounded-full bg-cream px-2 py-0.5 text-xs font-normal text-muted">Inactive</span>}
                      </p>
                      <p className="text-sm text-muted">
                        Cost {formatMoney(s.estimatedCostCents)}
                        {s.durationMinutes ? ` · ${s.durationMinutes} min` : ""}
                        {s.notes ? ` · ${s.notes}` : ""}
                      </p>
                    </div>
                    <span className="text-lg font-semibold tabular">{formatMoney(s.priceCents)}</span>
                    <IconBtn label={`Edit ${s.name}`} onClick={() => setEditing({ kind: "service", service: s })}>
                      <Pencil className="size-4" />
                    </IconBtn>
                    <IconBtn label={`Delete ${s.name}`} onClick={() => setConfirm({ kind: "service", id: s.id, name: s.name })}>
                      <Trash2 className="size-4" />
                    </IconBtn>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ))
      )}

      {editing?.kind === "service" && (
        <ServiceForm service={editing.service} defaultCategoryId={editing.categoryId} categories={categories} onClose={() => setEditing(null)} />
      )}
      {editing?.kind === "category" && <CategoryForm category={editing.category} onClose={() => setEditing(null)} />}
      <ConfirmationDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={doDelete}
        loading={deleting}
        destructive
        title={`Delete ${confirm?.name}?`}
        message={
          confirm?.kind === "service"
            ? "If this service appears in past sales it will be marked inactive instead, so your history stays intact."
            : "Only empty categories can be deleted. You can also hide a category by marking it inactive."
        }
        confirmLabel="Delete"
      />
    </div>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className="flex size-9 items-center justify-center rounded-full text-muted hover:bg-cream hover:text-ink">
      {children}
    </button>
  );
}

function useSave(onClose: () => void, message: string) {
  const router = useRouter();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string; fieldErrors?: Record<string, string> }>) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        setError(res.error ?? "Could not save.");
        setFieldErrors(res.fieldErrors ?? {});
        return;
      }
      toast({ tone: "success", title: message });
      onClose();
      router.refresh();
    });
  return { error, fieldErrors, pending, run };
}

function ServiceForm({
  service,
  defaultCategoryId,
  categories,
  onClose,
}: {
  service: Service | null;
  defaultCategoryId?: string;
  categories: Category[];
  onClose: () => void;
}) {
  const { error, fieldErrors, pending, run } = useSave(onClose, service ? "Service updated." : "Service added.");
  return (
    <Modal
      open
      onClose={onClose}
      title={service ? `Edit ${service.name}` : "New service"}
      description={service ? "Price changes only apply to new sales — past sales keep their original price." : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="service-form" loading={pending}>
            Save
          </Button>
        </>
      }
    >
      <form id="service-form" action={(fd) => run(() => saveServiceAction(service?.id ?? null, fd))} className="space-y-4">
        <FormError message={error} />
        <Field label="Name" htmlFor="name" error={fieldErrors.name}>
          <Input id="name" name="name" defaultValue={service?.name} required maxLength={80} autoFocus />
        </Field>
        <Field label="Category" htmlFor="categoryId" error={fieldErrors.categoryId}>
          <Select id="categoryId" name="categoryId" defaultValue={service?.categoryId ?? defaultCategoryId ?? categories[0]?.id} required>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Price" htmlFor="price" error={fieldErrors.price}>
            <MoneyInput id="price" name="price" defaultValue={service ? centsToInput(service.priceCents) : ""} required />
          </Field>
          <Field label="Estimated cost" htmlFor="estimatedCost" error={fieldErrors.estimatedCost} hint="Products used per service">
            <MoneyInput id="estimatedCost" name="estimatedCost" defaultValue={service ? centsToInput(service.estimatedCostCents) : "0"} />
          </Field>
          <Field label="Duration (min)" htmlFor="durationMinutes" optional error={fieldErrors.durationMinutes}>
            <Input id="durationMinutes" name="durationMinutes" type="number" inputMode="numeric" min={1} max={1440} defaultValue={service?.durationMinutes ?? ""} />
          </Field>
          <Field label="Sort order" htmlFor="sortOrder" error={fieldErrors.sortOrder} hint="Lower shows first">
            <Input id="sortOrder" name="sortOrder" type="number" inputMode="numeric" min={0} max={999} defaultValue={service?.sortOrder ?? 0} />
          </Field>
        </div>
        <Field label="Notes" htmlFor="notes" optional error={fieldErrors.notes}>
          <Textarea id="notes" name="notes" defaultValue={service?.notes ?? ""} maxLength={500} />
        </Field>
        <Checkbox name="active" defaultChecked={service?.active ?? true} label="Active — show on Quick Add Sale" />
      </form>
    </Modal>
  );
}

function CategoryForm({ category, onClose }: { category: Category | null; onClose: () => void }) {
  const { error, fieldErrors, pending, run } = useSave(onClose, category ? "Category updated." : "Category added.");
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={category ? `Edit ${category.name}` : "New category"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="category-form" loading={pending}>
            Save
          </Button>
        </>
      }
    >
      <form id="category-form" action={(fd) => run(() => saveCategoryAction(category?.id ?? null, fd))} className="space-y-4">
        <FormError message={error} />
        <Field label="Name" htmlFor="cat-name" error={fieldErrors.name}>
          <Input id="cat-name" name="name" defaultValue={category?.name} required maxLength={40} autoFocus />
        </Field>
        <Field label="Sort order" htmlFor="cat-sort" hint="Lower shows first on Quick Add Sale">
          <Input id="cat-sort" name="sortOrder" type="number" min={0} max={999} defaultValue={category?.sortOrder ?? 0} />
        </Field>
        <Checkbox name="active" defaultChecked={category?.active ?? true} label="Active — show on Quick Add Sale" />
      </form>
    </Modal>
  );
}
