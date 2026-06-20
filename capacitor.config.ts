import type { CapacitorConfig } from "@capacitor/cli"

// Healyx is server-rendered with API routes (chat, protocol, labs), so the native
// iOS shell loads the live deployment rather than a static bundle. Swap `server.url`
// to your custom domain (e.g. https://app.healyx.com) once it's set up.
const config: CapacitorConfig = {
  appId: "health.healyx.app",
  appName: "Healyx",
  webDir: "public",
  server: {
    url: "https://healyx-health.vercel.app",
    cleartext: false,
  },
  ios: {
    contentInset: "always",
  },
}

export default config
