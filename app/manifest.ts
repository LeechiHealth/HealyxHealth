import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Healyx Health",
    short_name: "Healyx",
    description: "Your personal health operating system — understand your data and act on it.",
    start_url: "/home",
    display: "standalone",
    background_color: "#0A1020",
    theme_color: "#0A1020",
    orientation: "portrait",
    icons: [
      { src: "/healyx-icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/healyx-icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/healyx-icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}
