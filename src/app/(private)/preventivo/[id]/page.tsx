import PreventivoCasePageClient from "./preventivo-case-page-client";
import { requireActiveUser } from "@/lib/server-session";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function PreventivoCasePage({ params }: Props) {
  const { id } = await params;
  await requireActiveUser(`/preventivo/${id}`);
  return <PreventivoCasePageClient caseId={id} />;
}
