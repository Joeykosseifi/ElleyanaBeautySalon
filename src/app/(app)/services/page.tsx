import { requireManager } from "@/server/auth-context";
import { listCatalog } from "@/server/services/catalog";
import { PageHeader } from "@/components/layout/page-header";
import { ServicesManager } from "@/components/services/services-manager";

export const metadata = { title: "Services" };

export default async function ServicesPage() {
  const ctx = await requireManager();
  const catalog = await listCatalog(ctx);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Services" description="Your menu, prices and estimated costs. Categories become the tabs on Quick Add Sale." />
      <ServicesManager categories={catalog} />
    </div>
  );
}
