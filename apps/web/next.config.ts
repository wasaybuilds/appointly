import type { NextConfig } from 'next';

/**
 * Next.js configuration.
 *
 * `transpilePackages` is required for the workspace contract package: it ships
 * as untranspiled ESM from the monorepo rather than as a published build
 * artefact, so Next must compile it alongside the app.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@appointly/shared'],

  // Next writes AGENTS.md/CLAUDE.md into the app directory by default; this
  // repository documents itself in `docs/`, so the generated files are noise.
  agentRules: false,

  // The app renders no remote images and sets no inline styles beyond Tailwind,
  // so the strict header set below costs nothing and closes the obvious gaps.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
