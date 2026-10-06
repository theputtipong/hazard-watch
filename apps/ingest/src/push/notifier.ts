import { buildPushPayload, type PushSubscription as WebPushSubscription } from '@block65/webcrypto-web-push';

export interface OutgoingMessage {
  title: string;
  body: string;
  url: string;
  /** Same tag replaces an older notification instead of stacking. */
  tag: string;
}

export type DeliveryResult = 'sent' | 'gone' | 'failed';

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
      try {
        const payload = await buildPushPayload({ data: JSON.stringify(message), options: { ttl: ttlSeconds } }, subscription, vapid);
        const res = await fetch(target.endpoint, payload);
        if (res.status === 404 || res.status === 410) return 'gone'; // the browser unsubscribed
        return res.ok ? 'sent' : 'failed';
      } catch {
        return 'failed';
      }
    },
  };
}

/** Only browser push services, so a subscription can't make us POST to arbitrary URLs. */
const PUSH_HOSTS = [/\.googleapis\.com$/, /\.mozilla\.com$/, /\.push\.apple\.com$/, /\.notify\.windows\.com$/, /^push\.services\.mozilla\.com$/];

export function isPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && PUSH_HOSTS.some((re) => re.test(url.hostname));
  } catch {
    return false;
  }
}
