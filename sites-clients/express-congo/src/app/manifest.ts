import type { MetadataRoute } from "next";
// Application client installable (PC et téléphone). Aucun service worker :
// aucune page ni document privé n’est mis en cache hors ligne (§14).
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Express Congo",
    short_name: "Express Congo",
    description:
      "Préparez vos envois de la France vers la République du Congo : devis, mesures et agences.",
    lang: "fr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0b1d3f",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "Demander un devis", url: "/devis/" },
      { name: "Calculer mon volume", url: "/prendre-les-mesures/" },
      { name: "Nos agences", url: "/agences/" },
    ],
  };
}
