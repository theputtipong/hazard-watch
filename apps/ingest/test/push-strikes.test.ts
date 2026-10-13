import { describe, expect, it } from 'vitest';
import { MAX_STRIKES, recordDelivery, strikeAction } from '../src/push/store';

describe('strikeAction', () => {
  it('deletes gone subscriptions at once', () => {
    expect(strikeAction(0, 'gone')).toBe('delete');
  });
  it('counts failures and deletes on the last strike', () => {
    expect(strikeAction(0, 'failed')).toBe('strike');
    expect(strikeAction(MAX_STRIKES - 2, 'failed')).toBe('strike');
    expect(strikeAction(MAX_STRIKES - 1, 'failed')).toBe('delete');
  });
  it('leaves the count alone when the failure was on our side or temporary', () => {
    expect(strikeAction(MAX_STRIKES - 1, 'transient')).toBe('none');
    expect(strikeAction(MAX_STRIKES - 1, 'overLimit')).toBe('none');
  });
  it('resets the count after a success', () => {
    expect(strikeAction(2, 'sent')).toBe('reset');
    expect(strikeAction(0, 'sent')).toBe('none');
  });
});

describe('recordDelivery', () => {
  const fakeDb = () => {
    const sql: string[] = [];
    const stmt = (q: string) => ({ bind: () => ({ run: async () => sql.push(q), q }) });
    const db = { prepare: stmt, batch: async (list: { q: string }[]) => list.forEach((s) => sql.push(s.q)) };
    return { db: db as unknown as D1Database, sql };
  };
  it('writes nothing for a healthy row', async () => {
    const { db, sql } = fakeDb();
    expect(await recordDelivery(db, { id: 'a', failures: 0 }, 'sent')).toBe('none');
    expect(sql).toEqual([]);
  });
  it('increments, resets and deletes', async () => {
    const { db, sql } = fakeDb();
    await recordDelivery(db, { id: 'a' }, 'failed');
    await recordDelivery(db, { id: 'a', failures: 1 }, 'sent');
    await recordDelivery(db, { id: 'a', failures: MAX_STRIKES - 1 }, 'failed');
    expect(sql[0]).toContain('failures = failures + 1');
    expect(sql[1]).toContain('failures = 0');
    expect(sql.slice(2)).toEqual(['DELETE FROM sent WHERE subscription_id = ?1', 'DELETE FROM subscriptions WHERE id = ?1']);
  });
});
