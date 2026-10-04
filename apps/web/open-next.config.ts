import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// No incremental cache: every page is rendered per request and data is fetched client-side,
// so we skip R2 (not on the free plan by default).
export default defineCloudflareConfig({});
