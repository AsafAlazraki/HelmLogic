import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    minimumCacheTTL: 86400,
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'www.yamaha-motor.com.au',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'media.highfieldboats.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.highfieldboats.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'www.northsidemarine.com.au',
        port: '',
        pathname: '/**',
      },
    ],
  },
  webpack: (config) => {
    config.module = {
      ...config.module,
      // Suppress the warning from opentelemetry, a dependency of genkit.
      // This is a known issue with how the library uses dynamic requires.
      exprContextCritical: false,
    };
    // @react-pdf/renderer depends on canvas which is a node module — tell
    // webpack to ignore it in the browser bundle (PDF is generated client-side).
    config.resolve = {
      ...config.resolve,
      fallback: {
        ...config.resolve?.fallback,
        canvas: false,
        fs: false,
      },
    };
    return config;
  },
};

export default nextConfig;
