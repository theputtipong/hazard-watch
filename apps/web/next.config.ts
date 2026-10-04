import type { NextConfig } from 'next';
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';

const nextConfig: NextConfig = {
  transpilePackages: ['@hw/core'],
};

export default nextConfig;

initOpenNextCloudflareForDev();
