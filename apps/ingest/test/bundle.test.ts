import { describe, expect, it } from 'vitest';
import { packBundle } from '../scripts/radarImage';
import { unpackRadar } from '../src/store';

describe('radar bundle', () => {
  it('round-trips each image', () => {
    const a = Buffer.from([1, 2, 3]);
    const b = Buffer.from([9, 8, 7, 6]);
    const buf = packBundle([
      { id: 'nkm', time: 't1', echoPixels: 5, png: a },
      { id: 'omkoi', time: 't2', echoPixels: 0, png: b },
    ]);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    expect([...unpackRadar(ab, 'omkoi')!.png]).toEqual([9, 8, 7, 6]);
    expect(unpackRadar(ab, 'nkm')!.entry).toMatchObject({ time: 't1', echoPixels: 5 });
    expect(unpackRadar(ab, 'missing')).toBeNull();
  });
});
