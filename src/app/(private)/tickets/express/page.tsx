import { redirect } from "next/navigation";

/**
 * Apunte express vive en /tickets (Gestión). Redirigimos enlaces antiguos.
 */
export default function ExpressTicketsPage() {
  redirect("/tickets");
}
