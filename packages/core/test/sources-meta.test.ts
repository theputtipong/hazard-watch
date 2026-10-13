import { describe, expect, it } from 'vitest';
import { SOURCE_META, type SourceId } from '../src';

const ALL: SourceId[] = ['open-meteo', 'tmd', 'air4thai', 'gistda', 'usgs', 'bma-flood', 'bma-rain', 'bma-traffic', 'thaiwater'];

describe('SOURCE_META', () => {
  it('has an entry for every source, keyed by its own id', () => {
    expect(Object.keys(SOURCE_META).sort()).toEqual([...ALL].sort());
    for (const id of ALL) expect(SOURCE_META[id].id).toBe(id);
  });

  it('links over https, except bmatraffic.com which has no https', () => {
    for (const { id, url } of Object.values(SOURCE_META)) {
      expect(url).toMatch(id === 'bma-traffic' ? /^http:\/\/www\.bmatraffic\.com$/ : /^https:\/\/[^/]+/);
    }
  });

  it('marks only Open-Meteo as non-government', () => {
    const nonGov = Object.values(SOURCE_META).filter((m) => !m.gov).map((m) => m.id);
    expect(nonGov).toEqual(['open-meteo']);
  });
});
