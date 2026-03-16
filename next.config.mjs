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
    // Allow up to 10MB request bodies — needed for base64-encoded medical images
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
}

export default nextConfig
