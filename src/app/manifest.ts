import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CCMGC Ticketing",
    short_name: "CCMGC",
    description: "Gestión de incidencias y flota",
    start_url: "/conductor",
    display: "standalone",
    background_color: "#0f172a",
    theme_color: "#2563eb",
    lang: "es",
    icons: [
      {
        src: "/icon.svg",
        type: "image/svg+xml",
        sizes: "any",
        purpose: "any",
      },
    ],
  };
}
