// Track E scanner: fetch sources, extract a comparable value, diff against saved state.
// Pure functions are exported for tests; network access is only in fetchSource().

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

export const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
export const KINDS = ['json', 'html', 'rss', 'wp-modified', 'status'];

const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

export function getPath(obj, path) {
  if (!path) return obj;
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[/^\d+$/.test(k) ? Number(k) : k]), obj);
}

// "{title} — {rewardAmount} {token}" → "Hisa video — 5000 USDC"
export function formatItem(item, template) {
  if (item == null) return '';
  if (typeof item !== 'object') return String(item);
  if (!template) return String(item.title ?? item.name ?? item.id ?? JSON.stringify(item));
  return template.replace(/\{([\w.]+)\}/g, (_, k) => {
    const v = getPath(item, k);
    return v == null ? '' : String(v);
  }).replace(/\s+/g, ' ').trim();
}

export function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function decode(s) {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}

export function rssItems(xml) {
  const out = [];
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) || [];
  for (const b of blocks) {
    const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(b);
    if (title) out.push(decode(title[1]));
  }
  return out;
}

function filterKeywords(items, keywords) {
  if (!keywords?.length) return items;
  const ks = keywords.map((k) => k.toLowerCase());
  return items.filter((i) => ks.some((k) => i.toLowerCase().includes(k)));
}

// Returns { type: 'list', items } | { type: 'scalar', value } | { type: 'hash', hash, sample }.
export function extract(src, { status, text }) {
  if (src.kind === 'status') return { type: 'scalar', value: String(status) };
  if (status < 200 || status >= 300) throw new Error(`HTTP ${status}`);
  switch (src.kind) {
    case 'json': {
      const data = JSON.parse(text);
      const v = getPath(data, src.extract);
      if (Array.isArray(v)) {
        const items = [...new Set(v.map((x) => formatItem(x, src.item)).filter(Boolean))];
        return { type: 'list', items: filterKeywords(items, src.keywords) };
      }
      if (v !== null && typeof v === 'object') return { type: 'hash', hash: sha(JSON.stringify(v)), sample: JSON.stringify(v).slice(0, 120) };
      return { type: 'scalar', value: String(v) };
    }
    case 'wp-modified': {
      const pages = JSON.parse(text);
      if (!Array.isArray(pages)) throw new Error('expected a JSON array of pages');
      const page = pages.find((p) => String(p.id) === String(src.extract));
      if (!page) throw new Error(`page id ${src.extract} not found`);
      return { type: 'scalar', value: String(page.modified) };
    }
    case 'rss': {
      const items = [...new Set(rssItems(text))];
      if (!items.length) throw new Error('no <item> or <entry> titles found');
      return { type: 'list', items: filterKeywords(items, src.keywords) };
    }
    case 'html': {
      if (src.extract) {
        const re = new RegExp(src.extract, 'gi');
        const items = [...new Set([...text.matchAll(re)].map((m) => decode((m[1] ?? m[0]).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ')))].filter(Boolean);
        return { type: 'list', items: filterKeywords(items, src.keywords) };
      }
      const vis = visibleText(text);
      return { type: 'hash', hash: sha(vis), sample: vis.slice(0, 120) };
    }
    default:
      throw new Error(`unknown kind "${src.kind}" (expected ${KINDS.join(', ')})`);
  }
}

// prev/cur are extract() results (or undefined). Returns { status, added, removed, from, to }.
export function diff(prev, cur) {
  if (!prev) return { status: 'NEW' };
  if (prev.type !== cur.type) return { status: 'CHANGED', from: prev.type, to: cur.type };
  if (cur.type === 'list') {
    const p = new Set(prev.items);
    const c = new Set(cur.items);
    const added = cur.items.filter((i) => !p.has(i));
    const removed = prev.items.filter((i) => !c.has(i));
    return added.length || removed.length ? { status: 'CHANGED', added, removed } : { status: 'UNCHANGED' };
  }
  if (cur.type === 'scalar') return prev.value === cur.value ? { status: 'UNCHANGED' } : { status: 'CHANGED', from: prev.value, to: cur.value };
  return prev.hash === cur.hash ? { status: 'UNCHANGED' } : { status: 'CHANGED', from: prev.sample, to: cur.sample };
}

export async function fetchSource(src, { timeoutMs = 15000, offlineDir } = {}) {
  if (offlineDir) {
    const f = [`${src.id}`, `${src.id}.json`, `${src.id}.html`, `${src.id}.xml`, `${src.id}.txt`].map((n) => join(offlineDir, n)).find(existsSync);
    if (!f) return { status: 404, text: '' };
    return { status: 200, text: readFileSync(f, 'utf8') };
  }
  const res = await fetch(src.url, {
    headers: { 'user-agent': UA, accept: 'application/json, text/html, application/rss+xml, application/atom+xml, */*' },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  });
  return { status: res.status, text: await res.text() };
}

export async function scan(watchlist, state, { only, offlineDir, timeoutMs, now = new Date() } = {}) {
  const sources = only?.length ? watchlist.filter((s) => only.includes(s.id)) : watchlist;
  const results = await Promise.all(sources.map(async (src) => {
    try {
      const got = await fetchSource(src, { timeoutMs, offlineDir });
      const cur = extract(src, got);
      const d = diff(state[src.id]?.value, cur);
      return { src, cur, ...d };
    } catch (e) {
      return { src, status: 'ERROR', error: e.name === 'TimeoutError' ? `timeout after ${timeoutMs ?? 15000} ms` : e.message };
    }
  }));
  const iso = now.toISOString();
  const next = { ...state };
  for (const r of results) {
    if (r.status === 'ERROR') { next[r.src.id] = { ...(state[r.src.id] || {}), lastChecked: iso, lastError: r.error }; continue; }
    const changed = r.status !== 'UNCHANGED';
    next[r.src.id] = { value: r.cur, lastChecked: iso, lastChanged: changed ? iso : state[r.src.id]?.lastChanged || iso };
  }
  return { results, state: next };
}

export function summarize(r, max = 5) {
  if (r.status === 'ERROR') return r.error;
  if (r.status === 'NEW') return r.cur.type === 'list' ? `${r.cur.items.length} item(s) baselined` : r.cur.type === 'scalar' ? `baseline: ${r.cur.value}` : 'baseline hash saved';
  if (r.status === 'UNCHANGED') return '';
  if (r.added || r.removed) {
    const parts = [];
    if (r.added?.length) parts.push(`+${r.added.length}: ${r.added.slice(0, max).join(' | ')}${r.added.length > max ? ' …' : ''}`);
    if (r.removed?.length) parts.push(`-${r.removed.length}`);
    return parts.join('  ');
  }
  return `${String(r.from).slice(0, 60)} → ${String(r.to).slice(0, 60)}`;
}

export function changesMarkdown(results, now = new Date()) {
  const order = { CHANGED: 0, NEW: 1, ERROR: 2, UNCHANGED: 3 };
  const rows = [...results].sort((a, b) => order[a.status] - order[b.status]);
  const lines = [
    '# Watchlist changes',
    '',
    `_Last scan: ${now.toISOString()} — generated by \`node bin/fund.mjs e:scan\`._`,
    '',
    '| Status | Source | Feeds | Detail |',
    '|---|---|---|---|',
    ...rows.map((r) => `| ${r.status} | [${r.src.id}](${r.src.url}) | ${r.src.feeds_track || ''} | ${summarize(r, 8).replace(/\|/g, '/')} |`),
    '',
  ];
  const changed = rows.filter((r) => r.status === 'CHANGED' && r.added?.length);
  if (changed.length) {
    lines.push('## New items', '');
    for (const r of changed) {
      lines.push(`### ${r.src.id}`, '', ...r.added.map((i) => `- ${i}`), '');
    }
  }
  return lines.join('\n');
}
