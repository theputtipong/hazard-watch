import { describe, expect, it } from 'vitest';
import { FEED_MAX_AGE_MINUTES } from '@hw/core';
import monitor from '../../../tools/monitor/config.json';
import { INGEST } from '../src/config';

describe('INGEST.runnerFeedEveryHours', () => {
  const feeds = monitor.feeds as unknown as Record<string, { maxStaleMinutes?: number }>;

  it('fetches daily ThaiWater dam data every 6 h, not every run', () => {
    expect(INGEST.runnerFeedEveryHours.dams).toBe(6);
  });

  it('keeps every throttled feed inside its monitor limit, allowing for runner lag', () => {
    for (const [name, hours] of Object.entries(INGEST.runnerFeedEveryHours)) {
      const limit = feeds[name]?.maxStaleMinutes ?? monitor.groups.runner.maxStaleMinutes;
      expect(hours! * 60 + FEED_MAX_AGE_MINUTES.runner, name).toBeLessThanOrEqual(limit);
    }
  });
});
