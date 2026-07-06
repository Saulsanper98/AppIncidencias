import MapaPageClient from "./mapa-page-client";
import { requireActiveUser } from "@/lib/server-session";

export const dynamic = "force-dynamic";

export default async function MapaPage() {
  await requireActiveUser("/mapa");
  return <MapaPageClient />;
}
