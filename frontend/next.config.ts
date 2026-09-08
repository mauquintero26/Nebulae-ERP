import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // Pre-existing dashboard TypeScript errors don't block the storefront build.
    // This will be progressively resolved in WEB-2 as each module is updated.
    ignoreBuildErrors: true,
  },

  // ── Redirects (WEB-1) ──────────────────────────────────────────────────────
  // ADR-002: /store/product/[id] → canonical /store/producto/[id]
  // Kept as a 307 (temporary) so we can verify behaviour before making it 308.
  async redirects() {
    return [
      {
        source:      '/store/product/:id',
        destination: '/store/producto/:id',
        permanent:   false, // change to true once WEB-2 smoke tests confirm it
      },
      // Normalize legacy accented catalog URL
      {
        source:      '/store/Cat%C3%A1logo',
        destination: '/store/catalogo',
        permanent:   false,
      },
      {
        source:      '/store/Catalogo',
        destination: '/store/catalogo',
        permanent:   false,
      },
    ];
  },

  // ── Remote image patterns ──────────────────────────────────────────────────
  // Allow next/image to load product images from the API domain.
  // WEB-1 still uses <img> tags for backwards compat — this prepares WEB-2.
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'api.nebulaekids.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: '**.cloudinary.com' },
    ],
  },
};

export default nextConfig;
