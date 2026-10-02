import { getAppContext } from "@/server/auth-context";
import { readReceipt } from "@/server/services/receipts";

export async function GET(_req: Request, { params }: { params: Promise<{ salonId: string; file: string }> }) {
  const { salonId, file } = await params;
  const ctx = await getAppContext();
  if (!ctx) return new Response("Unauthorized", { status: 401 });
  // Tenant isolation: users can only read their own salon's receipts.
  if (ctx.salonId !== salonId) return new Response("Not found", { status: 404 });
  const receipt = await readReceipt(salonId, file);
  if (!receipt) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(receipt.data), {
    headers: {
      "Content-Type": receipt.type,
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
