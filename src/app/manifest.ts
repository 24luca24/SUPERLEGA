import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Superlega",
    short_name: "Superlega",
    description: "Il torneo di calciobalilla Superlega: classifiche, ranking e partite live.",
    lang: "it",
    start_url: "/classifica",
    scope: "/",
    display: "standalone",
    background_color: "#0f1117",
    theme_color: "#0f1117",
    prefer_related_applications: false,
    icons: [
      { src: "/icons/superlega-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/superlega-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/superlega-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
