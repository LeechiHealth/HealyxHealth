import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Healyx Health",
    short_name: "Healyx",
    description: "Your personal health operating system — understand your data and act on it.",
    start_url: "/home",
    display: "standalone",
    background_color: "#0C1519",
    theme_color: "#0C1519",
    orientation: "portrait",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}
