import PreventivoPageClient from "./preventivo-page-client";
import { requireActiveUser } from "@/lib/server-session";

export const dynamic = "force-dynamic";

export default async function PreventivoPage() {
  await requireActiveUser("/preventivo");
  return <PreventivoPageClient />;
}
