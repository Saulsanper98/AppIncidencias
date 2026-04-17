import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CCMGC Ticketing",
    short_name: "CCMGC",
    description: "Centro de control de movilidad — ticketing",
    start_url: "/",
    display: "standalone",
    background_color: "#0a1628",
    theme_color: "#2563eb",
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
