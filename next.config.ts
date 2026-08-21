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
        // Only HTML admin pages — never /api/admin/* (photo uploads, etc.).
        urlPattern: ({ url }: { url: URL }) => url.pathname.startsWith('/admin'),
        handler: 'NetworkFirst',
        method: 'GET',
        options: {
          cacheName: 'admin-pages-v2',
          networkTimeoutSeconds: 10,
          expiration: { maxEntries: 16, maxAgeSeconds: 300 },
        },
      },
    ],
  },
});

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ['xlsx', 'sharp', 'heic-convert'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), microphone=(), geolocation=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ]
  },
};

export default withPWA(nextConfig);
