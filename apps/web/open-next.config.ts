import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// No incremental cache (pages render per request, data is fetched client-side), so no R2 needed.
export default defineCloudflareConfig({});
