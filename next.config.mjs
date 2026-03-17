/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Prevent Next.js from bundling Node-only packages — load them at runtime
  serverExternalPackages: ['canvas'],
  experimental: {
    // Allow up to 15MB request bodies — needed for base64-encoded medical images and health data exports
    serverActions: {
      bodySizeLimit: '15mb',
    },
  },
}

export default nextConfig
