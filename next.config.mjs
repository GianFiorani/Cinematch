import withSerwistInit from '@serwist/next';

// Disabled in dev: a service worker persists across restarts in the browser and would
// intercept requests independently of the running dev server, which is a much nastier
// staleness trap than the .next cache issues this project has already hit.
const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'image.tmdb.org',
        pathname: '/t/p/**',
      },
    ],
  },
};

export default withSerwist(nextConfig);
