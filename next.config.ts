import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  fallbacks: {
    document: "/~offline",
  },
  extendDefaultRuntimeCaching: true,
  workboxOptions: {
    // Admin/portal pages must always fetch fresh HTML/JS after deploys.
    navigateFallbackDenylist: [/^\/admin/, /^\/api/, /^\/dashboard/, /^\/foreman/, /^\/login/],
    runtimeCaching: [
      {
        urlPattern: /\/admin\//,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'admin-pages',
          networkTimeoutSeconds: 10,
          expiration: { maxEntries: 16, maxAgeSeconds: 300 },
        },
      },
    ],
  },
});

const nextConfig: NextConfig = {
  serverExternalPackages: ['xlsx', 'sharp'],
};

export default withPWA(nextConfig);
