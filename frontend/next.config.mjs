/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  images: { unoptimized: true },
  env: {
    // Extract a bare https:// URL in case Cloudflare Pages env var was set to
    // the full "KEY = VALUE" format by mistake (bakes the key name into the bundle).
    NEXT_PUBLIC_API_URL: (
      (process.env.NEXT_PUBLIC_API_URL ?? "").match(/https?:\/\/[^\s]+/)?.[0]
      ?? "https://sunday-app-production-d774.up.railway.app"
    ),
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
