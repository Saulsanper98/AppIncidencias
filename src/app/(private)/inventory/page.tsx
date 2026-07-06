import InventoryPageClient from "./inventory-page-client";
import { requireActiveUser } from "@/lib/server-session";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  await requireActiveUser("/inventory");
  return <InventoryPageClient />;
}
