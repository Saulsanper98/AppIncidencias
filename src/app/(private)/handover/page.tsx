import HandoverPageClient from "./handover-page-client";
import { requireActiveUser } from "@/lib/server-session";

export const dynamic = "force-dynamic";

export default async function HandoverPage() {
  await requireActiveUser("/handover");
  return <HandoverPageClient />;
}
