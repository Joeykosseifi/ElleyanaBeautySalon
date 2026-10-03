import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The floating Next.js dev badge sits in the bottom-left corner — exactly on top of
  // the mobile "Home" tab (and the desktop sidebar's account/logout row) — so taps there
  // opened the dev menu instead of navigating. Build/runtime errors are still reported
  // in the terminal and browser console.
  devIndicators: false,
  experimental: {
    serverActions: { bodySizeLimit: "6mb" },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
