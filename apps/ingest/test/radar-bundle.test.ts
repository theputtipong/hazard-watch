import { RADARS } from '@hw/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { packBundle } from '../scripts/radarImage';
import { app, type Env } from '../src/index';
import { KEYS, readRadarBundle, unpackRadar } from '../src/store';

const toArrayBuffer = (buf: Buffer) => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;

function build(header: unknown, data: number[], headerLength?: number): ArrayBuffer {
  const json = Buffer.from(typeof header === 'string' ? header : JSON.stringify(header));
  const len = Buffer.alloc(4);
  len.writeUInt32BE(headerLength ?? json.length);
  return toArrayBuffer(Buffer.concat([len, json, Buffer.from(data)]));
}

const entry = (over: Record<string, unknown> = {}) => ({ id: 'a', time: 't', echoPixels: 1, offset: 0, length: 2, ...over });

describe('readRadarBundle / unpackRadar bounds', () => {
  it('round-trips a packed bundle', () => {
    const ab = toArrayBuffer(
      packBundle([
        { id: 'nkm', time: 't1', echoPixels: 5, png: Buffer.from([1, 2, 3]) },
        { id: 'omkoi', time: 't2', echoPixels: 0, png: Buffer.from([9, 8, 7, 6]) },
      ]),
    );
    expect(readRadarBundle(ab)).toMatchObject({ dropped: 0 });
    expect([...unpackRadar(ab, 'nkm')!.png]).toEqual([1, 2, 3]);
    expect([...unpackRadar(ab, 'omkoi')!.png]).toEqual([9, 8, 7, 6]);
  });

  it('returns null for buffers too short or with a header length past the end', () => {
    expect(readRadarBundle(new ArrayBuffer(0))).toBeNull();
    expect(readRadarBundle(new ArrayBuffer(3))).toBeNull();
    expect(readRadarBundle(build({ radars: [] }, [], 0))).toBeNull();
    expect(readRadarBundle(build({ radars: [entry()] }, [1, 2], 0xffffffff))).toBeNull();
    expect(unpackRadar(build({ radars: [entry()] }, [1, 2], 10_000), 'a')).toBeNull();
  });

  it('returns null for an unreadable header', () => {
    expect(readRadarBundle(build('{not json', [1, 2]))).toBeNull();
    expect(readRadarBundle(build('null', [1, 2]))).toBeNull();
    expect(readRadarBundle(build({ radars: 'x' }, [1, 2]))).toBeNull();
    expect(unpackRadar(build('{not json', [1, 2]), 'a')).toBeNull();
  });

  it('drops entries that would read outside the image bytes', () => {
    const truncated = build({ radars: [entry({ length: 5 })] }, [1, 2]);
    expect(unpackRadar(truncated, 'a')).toBeNull();
    expect(readRadarBundle(truncated)).toMatchObject({ radars: [], dropped: 1 });
    expect(unpackRadar(build({ radars: [entry({ offset: 1, length: 2 })] }, [1, 2]), 'a')).toBeNull();
    expect(unpackRadar(build({ radars: [entry({ offset: 2, length: 0 })] }, [1, 2]), 'a')).toBeNull();
  });

  it('drops negative, fractional, non-numeric and huge offsets or lengths', () => {
    for (const bad of [
      { offset: -1 },
      { offset: 0.5 },
      { offset: '0' },
      { offset: Number.MAX_SAFE_INTEGER + 2 },
      { length: -2 },
      { length: 1.5 },
      { length: null },
      { length: 1e300 },
      { id: 5 },
      { time: undefined },
    ]) {
      expect(unpackRadar(build({ radars: [entry(bad)] }, [1, 2]), 'a'), JSON.stringify(bad)).toBeNull();
    }
  });

  it('keeps good entries next to bad ones and drops an overlapping one', () => {
    const ab = build(
      {
        radars: [
          entry({ id: 'a', offset: 0, length: 2 }),
          entry({ id: 'b', offset: 1, length: 2 }),
          entry({ id: 'c', offset: 2, length: 1 }),
          entry({ id: 'd', offset: 9 }),
        ],
      },
      [1, 2, 3],
    );
    expect([...unpackRadar(ab, 'a')!.png]).toEqual([1, 2]);
    expect(unpackRadar(ab, 'b')).toBeNull();
    expect([...unpackRadar(ab, 'c')!.png]).toEqual([3]);
    expect(unpackRadar(ab, 'd')).toBeNull();
    expect(readRadarBundle(ab)!.dropped).toBe(2);
  });
});

describe('radar bundle routes', () => {
  const TOKEN = 'secret-token-123';
  const radarId = Object.keys(RADARS)[0]!;
  const ctx = { waitUntil: (p: Promise<unknown>) => void p.catch(() => {}), passThroughOnException() {}, props: {} } as unknown as ExecutionContext;

  function makeEnv() {
    const data = new Map<string, ArrayBuffer>();
    const kv = {
      async get(key: string) {
        return data.get(key) ?? null;
      },
      async put(key: string, value: ArrayBuffer) {
        data.set(key, value);
      },
    };
    const env = { SNAPSHOTS: kv as unknown as KVNamespace, INGEST_TOKEN: TOKEN, ALLOWED_ORIGINS: 'https://hazard.pdouvch.com' } as Env;
    return { env, data };
  }

  const put = (env: Env, body: ArrayBuffer) =>
    app.request(
      '/ingest/radar-bundle',
      { method: 'PUT', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/octet-stream' }, body },
      env,
      ctx,
    );

  beforeEach(() => {
    (globalThis as unknown as { caches: unknown }).caches = { default: { match: async () => undefined, put: async () => {} } };
  });
  afterEach(() => {
    delete (globalThis as unknown as { caches?: unknown }).caches;
  });

  it('rejects corrupt bundles without storing them', async () => {
    const { env, data } = makeEnv();
    for (const body of [
      new ArrayBuffer(2),
      build({ radars: [entry()] }, [1, 2], 9_999),
      build({ radars: [entry({ length: 9 })] }, [1, 2]),
      build({ radars: [entry({ offset: -1 })] }, [1, 2]),
    ]) {
      expect((await put(env, body)).status).toBe(400);
    }
    expect(data.has(KEYS.radarBundle)).toBe(false);
  });

  it('stores a good bundle and serves its image, 404 when nothing is stored', async () => {
    const { env } = makeEnv();
    const png = [137, 80, 78, 71];
    const bundle = packBundle([{ id: radarId, time: '2026-10-13T00:00:00Z', echoPixels: 3, png: Buffer.from(png) }]);
    expect((await put(env, toArrayBuffer(bundle))).status).toBe(200);
    const res = await app.request(`/v1/radar/${radarId}`, {}, env, ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-radar-time')).toBe('2026-10-13T00:00:00Z');
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual(png);

    expect((await app.request(`/v1/radar/${radarId}`, {}, makeEnv().env, ctx)).status).toBe(404);
  });

  it('serves 404 rather than throwing when the stored bundle is corrupt', async () => {
    const { env, data } = makeEnv();
    data.set(KEYS.radarBundle, build({ radars: [entry({ id: radarId, length: 99 })] }, [1, 2]));
    expect((await app.request(`/v1/radar/${radarId}`, {}, env, ctx)).status).toBe(404);
  });
});
