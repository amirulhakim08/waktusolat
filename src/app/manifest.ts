import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WaktuSolat",
    short_name: "WaktuSolat",
    description: "Paparan waktu solat & papan tanda digital untuk masjid dan surau.",
    start_url: "/",
    display: "fullscreen",
    orientation: "landscape",
    background_color: "#062a22",
    theme_color: "#064e3b",
    lang: "ms",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
