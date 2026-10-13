import { buildPushPayload, type PushSubscription as WebPushSubscription } from '@block65/webcrypto-web-push';

export interface OutgoingMessage {
  title: string;
  body: string;
  url: string;
  /** Same tag replaces an older notification instead of stacking. */
  tag: string;
}

/**
 * Only an answer from the push service says something about the subscription:
 * 'gone' (404/410) and 'failed' (other 4xx) are about the row, 'transient' (network error, 408, 429, 5xx) is not,
 * 'unauthorized' (401/403) is a transient error caused by our VAPID credentials, not the subscriber,
 * and 'overLimit' means this Worker invocation ran out of subrequests, so the run must stop.
 */
export type DeliveryResult = 'sent' | 'gone' | 'failed' | 'transient' | 'unauthorized' | 'overLimit';

export interface Notifier<Target> {
  channel: string;
  send(target: Target, message: OutgoingMessage, ttlSeconds: number): Promise<DeliveryResult>;
}

export interface WebPushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export function webPushNotifier(vapid: { subject: string; publicKey: string; privateKey: string }): Notifier<WebPushTarget> {
  return {
    channel: 'webpush',
    async send(target, message, ttlSeconds) {
      const subscription: WebPushSubscription = {
        endpoint: target.endpoint,
        expirationTime: null,
        keys: { p256dh: target.p256dh, auth: target.auth },
      };
      // Rows stored before the host list was tightened are dropped rather than POSTed to.
      if (!isPushEndpoint(target.endpoint)) return 'gone';
      let payload: Awaited<ReturnType<typeof buildPushPayload>>;
      try {
        payload = await buildPushPayload({ data: JSON.stringify(message), options: { ttl: ttlSeconds } }, subscription, vapid);
      } catch {
        return 'failed'; // keys that can't be encrypted to won't work next time either
      }
      try {
        return resultFor((await fetch(target.endpoint, payload)).status);
      } catch (err) {
        return isSubrequestLimit(err) ? 'overLimit' : 'transient';
      }
    },
  };
}

export function resultFor(status: number): DeliveryResult {
  if (status >= 200 && status < 300) return 'sent';
  if (status === 404 || status === 410) return 'gone'; // the browser unsubscribed
  if (status === 401 || status === 403) return 'unauthorized'; // our VAPID JWT was rejected
  if (status === 408 || status === 429 || status < 400 || status >= 500) return 'transient';
  return 'failed';
}

/** Workers throw "Too many subrequests." once an invocation hits its plan's cap (50 on Workers Free). */
export function isSubrequestLimit(err: unknown): boolean {
  return /too many subrequests/i.test(err instanceof Error ? err.message : String(err));
}

/** Only browser push services, so a subscription can't make us POST to arbitrary URLs. */
const PUSH_HOSTS = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'push.services.mozilla.com'];
/** Apple and Windows shard their push hosts (web.push.apple.com, wns2-*.notify.windows.com). */
const PUSH_HOST_SUFFIXES = ['.push.apple.com', '.notify.windows.com'];

export function isPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:' || url.port || url.username || url.password) return false;
    const host = url.hostname;
    return PUSH_HOSTS.includes(host) || PUSH_HOST_SUFFIXES.some((s) => host.endsWith(s));
  } catch {
    return false;
  }
}
