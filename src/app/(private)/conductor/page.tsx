import { redirect } from "next/navigation";

export default function ConductorLegacyPage() {
  redirect("/dashboard?vista=conductor");
}
