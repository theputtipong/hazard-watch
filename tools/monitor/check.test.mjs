// node --test tools/monitor/check.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluate, issueBody, loadConfig, mdCode, mdText, plan } from './check.mjs';

const config = { ...loadConfig(), ignore: ['flood'] };
const now = new Date('2026-10-05T12:00:00Z');
const minsAgo = (m) => new Date(now.getTime() - m * 60_000).toISOString();
const feed = (over) => ({ source: 'x', fetchedAt: minsAgo(5), ok: true, items: [1], ...over });
const snapshot = (edge, runner) => ({ edge: { updatedAt: minsAgo(5), feeds: edge }, runner: { updatedAt: minsAgo(5), feeds: runner } });
const byName = (rs) => Object.fromEntries(rs.map((r) => [r.name, r]));

test('fresh feeds are ok; stale or long-failing feeds are down', () => {
  const r = byName(
    evaluate({
      now,
      config,
      snapshot: snapshot(
        { pm25: feed(), quakesTmd: feed({ fetchedAt: minsAgo(90), lastOkAt: minsAgo(90) }) },
        {
          waterlevel: feed({ ok: false, error: '429', lastOkAt: minsAgo(30), failingSince: minsAgo(20) }),
          radar: feed({ ok: false, error: '500', lastOkAt: minsAgo(400), failingSince: minsAgo(390) }),
          flood: feed({ ok: false, error: '403', items: [] }),
        },
      ),
    }),
  );
  assert.equal(r.api.down, false);
  assert.equal(r.pm25.down, false);
  assert.equal(r.quakesTmd.down, true); // edge limit 60 min
  assert.equal(r.waterlevel.down, false); // failing briefly, within runner limit
  assert.equal(r.radar.down, true);
  assert.equal(r.radar.since, minsAgo(390));
  assert.equal(r.flood.down, true);
  assert.equal(r.flood.ignored, true);
});

test('daily cctv list uses its own threshold, not the 6 h runner default', () => {
  const r = byName(evaluate({ now, config, snapshot: snapshot({}, { cctv: feed({ fetchedAt: minsAgo(449) }) }) }));
  assert.equal(r.cctv.down, false);
  const late = byName(evaluate({ now, config, snapshot: snapshot({}, { cctv: feed({ fetchedAt: minsAgo(31 * 60) }) }) }));
  assert.equal(late.cctv.down, true);
});

test('plan opens one issue per new outage, closes recovered ones, skips ignored', () => {
  const results = [
    { name: 'radar', down: true, ignored: false },
    { name: 'pm25', down: true, ignored: false },
    { name: 'cctv', down: false, ignored: false },
    { name: 'flood', down: true, ignored: true },
  ];
  const actions = plan(results, [
    { number: 1, name: 'pm25' },
    { number: 2, name: 'cctv' },
  ]);
  assert.deepEqual(
    actions.map((a) => [a.type, a.result.name]),
    [
      ['open', 'radar'],
      ['close', 'cctv'],
    ],
  );
});

test('unreachable API yields only the API issue, leaving feed issues alone', () => {
  const results = evaluate({ now, config, apiError: 'HTTP 503' });
  assert.deepEqual(results.map((r) => [r.name, r.down]), [['api', true]]);
  assert.deepEqual(plan(results, [{ number: 3, name: 'radar' }]).map((a) => a.type), ['open']);
});

test('issue body keeps upstream error text inert', () => {
  const error = 'boom ` @octocat ![x](https://evil.example/p.png) ``` -->';
  const [down] = evaluate({ now, config, snapshot: snapshot({}, { 'rain-->x': feed({ ok: false, error, fetchedAt: minsAgo(999), lastOkAt: minsAgo(999) }) }) }).filter((r) => r.down);
  const body = issueBody(down, config);
  const reason = body.split('\n')[1];
  assert.ok(!reason.includes('@octocat'), 'mention must be broken');
  assert.ok(!reason.includes('![x]('), 'image must be escaped outside code');
  assert.ok(body.includes(mdCode(error)));
  assert.equal(body.split('\n')[0], '<!-- hw-monitor:rain--_x -->');
  assert.equal(mdCode('a ``` b'), '```` a ``` b ````');
  assert.equal(mdText('*x* @y\n`z`'), '\\*x\\* @​y \\`z\\`');
});
