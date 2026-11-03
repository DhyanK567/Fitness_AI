import path from 'path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, '../'),
  reactStrictMode: true,
  devIndicators: false,
  images: {
    // The app intentionally uses remote editorial photography; let the browser load it directly.
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 'plus.unsplash.com',
      },
    ],
  },
  async redirects() {
    return [
      {
        source: '/studio-login',
        destination: '/staff-login?mode=login',
        permanent: false,
      },
      {
        source: '/studio-register',
        destination: '/staff-login?mode=register',
        permanent: false,
      },
      {
        source: '/register',
        destination: '/staff-login?mode=register',
        permanent: false,
      },
      {
        source: '/member',
        destination: '/portal',
        permanent: false,
      },
      {
        source: '/member/home',
        destination: '/portal?tab=home',
        permanent: false,
      },
      {
        source: '/member/book-class',
        destination: '/portal?tab=schedule',
        permanent: false,
      },
      {
        source: '/member/check-in',
        destination: '/portal?tab=pass',
        permanent: false,
      },
      {
        source: '/member/attendance',
        destination: '/portal?tab=attendance',
        permanent: false,
      },
      {
        source: '/member/my-payments',
        destination: '/portal?tab=payments',
        permanent: false,
      },
      {
        source: '/member/my-membership',
        destination: '/portal?tab=profile',
        permanent: false,
      },
      {
        source: '/member/my-profile',
        destination: '/portal?tab=profile',
        permanent: false,
      },
      {
        source: '/member/recommendations',
        destination: '/portal?tab=rewards',
        permanent: false,
      },
      {
        source: '/member/events',
        destination: '/portal?tab=schedule',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
