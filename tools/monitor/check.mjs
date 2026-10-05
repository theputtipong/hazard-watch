#!/usr/bin/env node
/**
 * Source-outage monitor. Fetches the public snapshot, decides which feeds are down
 * (last successful fetch older than the threshold in config.json), then keeps exactly one
 * open GitHub issue per down feed and closes it with a comment once the feed recovers.
 *
 *   node tools/monitor/check.mjs --dry-run      # print what it would do, no GitHub calls
 *   GITHUB_TOKEN=... GITHUB_REPOSITORY=owner/repo node tools/monitor/check.mjs
 *
 * No dependencies: Node 22 (global fetch).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CONFIG_PATH = new URL('./config.json', import.meta.url);
const MARKER = (name) => `<!-- hw-monitor:${name} -->`;
const MARKER_RE = /<!-- hw-monitor:([\w-]+) -->/;

export function loadConfig(path = CONFIG_PATH) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function maxStaleMinutes(config, group, feed) {
  return config.feeds?.[feed]?.maxStaleMinutes ?? config.groups[group].maxStaleMinutes;
}

/** Last time the feed is known to have fetched successfully, or null if unknown. */
function lastGoodAt(result) {
  if (result.lastOkAt) return result.lastOkAt;
  if (result.ok) return result.fetchedAt;
  // Older snapshots without lastOkAt: a failed feed keeps the fetchedAt of its last good items.
  return result.items?.length ? result.fetchedAt : null;
}

/**
 * Pure decision step. Returns one entry per checked name:
 * { name, group, down, ignored, reason, since, details }.
 * `apiError` set means the snapshot could not be read at all (only the API entry is returned).
 */
export function evaluate({ snapshot, apiError, config, now = new Date() }) {
  const ignore = new Set(config.ignore ?? []);
  if (apiError) {
    return [{ name: config.apiIssueName, group: 'api', down: true, ignored: false, reason: `API ไม่ตอบสนอง: ${apiError}`, since: now.toISOString(), details: {} }];
  }
  const out = [{ name: config.apiIssueName, group: 'api', down: false, ignored: false, reason: 'ok', since: null, details: {} }];
  for (const group of Object.keys(config.groups).filter((g) => !g.startsWith('$'))) {
    const snap = snapshot[group];
    if (!snap) {
      out.push({ name: group, group, down: true, ignored: ignore.has(group), reason: `ไม่มี snapshot ของกลุ่ม ${group}`, since: null, details: {} });
      continue;
    }
    for (const [feed, result] of Object.entries(snap.feeds ?? {})) {
      const limit = maxStaleMinutes(config, group, feed);
      const good = lastGoodAt(result);
      const ageMin = good ? (now.getTime() - Date.parse(good)) / 60_000 : Infinity;
      const down = ageMin > limit;
      const reason = !down
        ? 'ok'
        : !result.ok
          ? `ดึงข้อมูลล้มเหลว: ${result.error ?? 'unknown error'}`
          : `ข้อมูลไม่อัปเดตเกิน ${limit} นาที`;
      out.push({
        name: feed,
        group,
        down,
        ignored: ignore.has(feed),
        reason,
        since: result.ok ? good : (result.failingSince ?? good),
        details: {
          source: result.source,
          ok: result.ok,
          error: result.error,
          fetchedAt: result.fetchedAt,
          lastOkAt: good,
          failingSince: result.failingSince,
          groupUpdatedAt: snap.updatedAt,
          ageMinutes: Number.isFinite(ageMin) ? Math.round(ageMin) : null,
          maxStaleMinutes: limit,
        },
      });
    }
  }
  return out;
}

/** Turns evaluation + currently open issues ({number, name}) into create/close actions. */
export function plan(results, openIssues) {
  const open = new Map(openIssues.map((i) => [i.name, i]));
  const actions = [];
  for (const r of results) {
    if (r.ignored) continue; // known problems: never open, and leave any existing issue to the owner
    const issue = open.get(r.name);
    if (r.down && !issue) actions.push({ type: 'open', result: r });
    if (!r.down && issue) actions.push({ type: 'close', result: r, issue });
  }
  return actions;
}

function issueTitle(config, name) {
  return `${config.titlePrefix}${name}`;
}

function issueBody(r, config) {
  const d = r.details;
  const lines = [
    MARKER(r.name),
    `**${r.reason}**`,
    '',
    `- feed: \`${r.name}\` (group: ${r.group})`,
    r.since ? `- เริ่มมีปัญหา/ข้อมูลล่าสุด: ${r.since}` : '- ยังไม่เคยดึงข้อมูลสำเร็จ (หรือไม่ทราบเวลา)',
  ];
  if (d.source) lines.push(`- source: ${d.source}`);
  if (d.error) lines.push(`- error: \`${String(d.error).slice(0, 500)}\``);
  if (d.lastOkAt) lines.push(`- lastOkAt: ${d.lastOkAt}`);
  if (d.failingSince) lines.push(`- failingSince: ${d.failingSince}`);
  if (d.groupUpdatedAt) lines.push(`- group updatedAt: ${d.groupUpdatedAt}`);
  if (d.maxStaleMinutes != null) lines.push(`- threshold: ${d.maxStaleMinutes} นาที (อายุข้อมูล ${d.ageMinutes ?? '∞'} นาที)`);
  lines.push('', `เปิดโดย monitor อัตโนมัติ (${config.snapshotUrl}); ปิดเองเมื่อกลับมาปกติ. แก้ threshold / ignore ที่ \`tools/monitor/config.json\``);
  return lines.join('\n');
}

async function fetchSnapshot(config) {
  try {
    const res = await fetch(config.snapshotUrl, { signal: AbortSignal.timeout(config.requestTimeoutMs), headers: { 'user-agent': 'hw-monitor' } });
    if (!res.ok) return { apiError: `HTTP ${res.status}` };
    return { snapshot: await res.json() };
  } catch (err) {
    return { apiError: err?.message ?? String(err) };
  }
}

function github(token, repo) {
  const call = async (method, path, body) => {
    const res = await fetch(`https://api.github.com/repos/${repo}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'user-agent': 'hw-monitor',
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok && !(method === 'GET' && res.status === 404)) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
    return res.status === 404 ? null : res.json();
  };
  return call;
}

async function listOpenIssues(gh, config) {
  const issues = (await gh('GET', `/issues?state=open&labels=${encodeURIComponent(config.label)}&per_page=100`)) ?? [];
  return issues
    .filter((i) => !i.pull_request)
    .map((i) => {
      const name = i.body?.match(MARKER_RE)?.[1] ?? (i.title.startsWith(config.titlePrefix) ? i.title.slice(config.titlePrefix.length).trim() : null);
      return name ? { number: i.number, name } : null;
    })
    .filter(Boolean);
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const config = loadConfig();
  if (process.env.MONITOR_SNAPSHOT_URL) config.snapshotUrl = process.env.MONITOR_SNAPSHOT_URL; // for testing
  const { snapshot, apiError } = await fetchSnapshot(config);
  const results = evaluate({ snapshot, apiError, config });

  for (const r of results) {
    const state = r.ignored ? (r.down ? 'IGNORED(down)' : 'IGNORED(ok)') : r.down ? 'DOWN' : 'ok';
    console.log(`${state.padEnd(14)} ${r.name.padEnd(12)} ${r.reason}${r.since ? ` (${r.down ? 'since' : 'last ok'} ${r.since})` : ''}`);
  }

  let gh = null;
  let open = [];
  if (!dryRun) {
    const { GITHUB_TOKEN, GITHUB_REPOSITORY } = process.env;
    if (!GITHUB_TOKEN || !GITHUB_REPOSITORY) throw new Error('GITHUB_TOKEN and GITHUB_REPOSITORY are required (or pass --dry-run)');
    gh = github(GITHUB_TOKEN, GITHUB_REPOSITORY);
    open = await listOpenIssues(gh, config);
  }
  // When the API is down we can't judge feeds, so only the API issue is touched.
  const actions = plan(results, open);

  if (!actions.length) console.log('no changes');
  if (gh && actions.some((a) => a.type === 'open') && !(await gh('GET', `/labels/${encodeURIComponent(config.label)}`))) {
    await gh('POST', '/labels', { name: config.label, color: 'd73a4a', description: 'Data source outage (opened by tools/monitor)' });
  }
  for (const a of actions) {
    const title = issueTitle(config, a.result.name);
    if (a.type === 'open') {
      console.log(`${dryRun ? '[dry-run] would open' : 'open'}: "${title}"`);
      if (dryRun) console.log(issueBody(a.result, config).replace(/^/gm, '    '));
      else console.log(`  -> #${(await gh('POST', '/issues', { title, body: issueBody(a.result, config), labels: [config.label] })).number}`);
    } else {
      console.log(`${dryRun ? '[dry-run] would close' : 'close'}: #${a.issue.number} "${title}"`);
      if (!dryRun) {
        await gh('POST', `/issues/${a.issue.number}/comments`, { body: `กลับมาปกติแล้ว (ตรวจเมื่อ ${new Date().toISOString()})` });
        await gh('PATCH', `/issues/${a.issue.number}`, { state: 'closed', state_reason: 'completed' });
      }
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
