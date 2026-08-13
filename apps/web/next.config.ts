import type { NextConfig } from 'next';

/**
 * Next.js configuration.
 *
 * `transpilePackages` is required for the workspace contract package: it ships
 * as untranspiled ESM from the monorepo rather than as a published build
 * artefact, so Next must compile it alongside the app.
 */

/** Where the API actually lives. Read at build time, so a change needs a redeploy. */
const apiOrigin = process.env.API_ORIGIN ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@appointly/shared'],

  /*
    The API is deployed on its own host, but the browser must not call it
    directly. A session cookie issued by a different registrable domain is a
    third-party cookie, and Safari blocks those outright while Chrome blocks
    them in incognito — `SameSite=None` only asks permission, it cannot compel.
    Proxying through this app means the browser only ever sees one origin, so
    the cookie is first-party and survives everywhere.
  */
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${apiOrigin}/api/v1/:path*`,
      },
    ];
  },

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
