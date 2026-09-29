// Fact refresh: re-check facts/FACTS.md rows against machine-readable sources (facts/sources.json).
// Dependency-free. Never writes anything but the value/date/status cells of the probed rows.
//
// sources.json: { "F-007": { kind, url, path?, format?, expect?, match?, contains?, regex?, monotonic?, untested?, note? } }
//   kind "json"     GET url, parse JSON, read `path` ("a.b.0.c", "functions[*].invocations"; `reduce: "sum"` for arrays)
//   kind "contains" GET url as text; CONFIRMED when every `contains` string is present
//   kind "regex"    GET url as text; first capture group of `regex` is the value
//   kind "status"   GET url; CONFIRMED on HTTP 2xx
//   format "number" → the value is compared with the first number in the FACTS value cell; --write replaces it
//   expect / match  → boolean probe: equal to `expect`, or matching the `match` regex (case-insensitive)
//   monotonic "increasing" → a smaller fetched number is reported as DRIFT but never written

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export function factsPath(explicit) {
  return explicit || process.env.FUND_FACTS || join(ROOT, 'facts', 'FACTS.md');
}
export function sourcesPath(explicit) {
  return explicit || process.env.FUND_SOURCES || join(ROOT, 'facts', 'sources.json');
}

export function loadSources(file) {
  const f = sourcesPath(file);
  if (!existsSync(f)) return {};
  let raw;
  try { raw = JSON.parse(readFileSync(f, 'utf8')); } catch (e) { throw new Error(`${f} is not valid JSON (${e.message}) — fix it, then re-run`); }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`${f} must be a JSON object keyed by fact id ("F-007": { ... })`);
  const out = {};
  for (const [k, v] of Object.entries(raw)) if (/^F-\d{3}$/.test(k) && v && typeof v === 'object') out[k] = v;
  return out;
}

// ---------- FACTS.md table ----------

const ROW = /^\|\s*(F-\d{3})\s*\|/;

export function readFactRows(file) {
  const text = readFileSync(factsPath(file), 'utf8');
  const rows = new Map();
  for (const line of text.split(/\r?\n/)) {
    const m = ROW.exec(line);
    if (!m) continue;
    const [id, label, value, source, date, status] = line.split('|').slice(1, -1).map((c) => c.trim());
    rows.set(id, { id, label, value, source, date, status });
  }
  return rows;
}

/** Replace cells of one row in place; every other line is byte-identical. */
export function updateFactRow(text, id, patch) {
  const lines = text.split('\n');
  let hit = false;
  for (let i = 0; i < lines.length; i++) {
    const m = ROW.exec(lines[i]);
    if (!m || m[1] !== id) continue;
    const cr = lines[i].endsWith('\r');
    const cells = lines[i].replace(/\r$/, '').split('|').slice(1, -1).map((c) => c.trim());
    const idx = { label: 1, value: 2, source: 3, date: 4, status: 5 };
    for (const [k, v] of Object.entries(patch)) if (k in idx) cells[idx[k]] = String(v).replace(/\|/g, '/');
    lines[i] = `| ${cells.join(' | ')} |${cr ? '\r' : ''}`;
    hit = true;
    break;
  }
  if (!hit) throw new Error(`fact ${id} not found`);
  return lines.join('\n');
}

// ---------- numbers ----------

/** First number in a cell: "1,218,693" → 1218693, "542k" → 542000, "1.2M" → 1200000. */
export function firstNumber(s) {
  const m = /(\d[\d,]*(?:\.\d+)?)\s*(k|m|million|thousand|b|billion)?\b/i.exec(String(s ?? ''));
  if (!m) return null;
  let n = Number(m[1].replace(/,/g, ''));
  const u = (m[2] || '').toLowerCase();
  if (u === 'k' || u === 'thousand') n *= 1e3;
  else if (u === 'm' || u === 'million') n *= 1e6;
  else if (u === 'b' || u === 'billion') n *= 1e9;
  return Number.isFinite(n) ? n : null;
}

/** Replace the first number in a value cell, keeping comma grouping if the old one had it. */
export function replaceFirstNumber(cell, n) {
  return String(cell).replace(/\d[\d,]*(?:\.\d+)?/, (old) => (old.includes(',') || n >= 10000 ? Math.round(n).toLocaleString('en-US') : String(n)));
}

// ---------- probing ----------

export function getPath(obj, path) {
  if (!path) return obj;
  const parts = String(path).replace(/\[(\*|\d+)\]/g, '.$1').split('.').filter(Boolean);
  let cur = [obj];
  let spread = false;
  for (const p of parts) {
    if (p === '*') { spread = true; cur = cur.flatMap((c) => (Array.isArray(c) ? c : c && typeof c === 'object' ? Object.values(c) : [])); continue; }
    cur = cur.map((c) => (c == null ? undefined : c[p]));
  }
  if (spread) return cur.length && cur.some((v) => v !== undefined) ? cur.filter((v) => v !== undefined) : undefined; // empty spread = path not found, never "0"
  return cur[0];
}

async function fetchWithTimeout(url, ms, fetchImpl = globalThis.fetch) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetchImpl(url, { signal: ctl.signal, redirect: 'follow', headers: { 'user-agent': 'fund-refresh/1 (+facts check)', accept: 'application/json,text/html;q=0.9,*/*;q=0.5' } });
    const body = await res.text();
    return { status: res.status, ok: res.ok, body };
  } finally { clearTimeout(t); }
}

/**
 * Run one probe. Returns { value, confirmed?: boolean, numeric: boolean, detail }.
 * Throws on network/parse failures (the caller turns that into FAILED).
 */
export async function runProbe(probe, { timeoutMs = 15000, fetchImpl } = {}) {
  if (!probe?.url) throw new Error('probe has no url');
  const res = await fetchWithTimeout(probe.url, timeoutMs, fetchImpl);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const kind = probe.kind || 'json';
  let value;
  if (kind === 'status') return { value: res.status, confirmed: true, numeric: false, detail: `HTTP ${res.status}` };
  if (kind === 'contains') {
    const need = [].concat(probe.contains || []);
    if (!need.length) throw new Error('contains probe has no "contains"');
    const missing = need.filter((s) => !res.body.includes(s));
    return { value: missing.length ? `missing ${missing.join(', ')}` : 'present', confirmed: !missing.length, numeric: false, detail: missing.length ? `page lacks: ${missing.join(', ')}` : `page contains ${need.join(', ')}` };
  }
  if (kind === 'regex') {
    const m = new RegExp(probe.regex, 'i').exec(res.body);
    if (!m) throw new Error(`regex /${probe.regex}/ did not match`);
    value = m[1] ?? m[0];
  } else if (kind === 'json') {
    let data;
    try { data = JSON.parse(res.body); } catch { throw new Error('response is not JSON'); }
    value = getPath(data, probe.path);
    if (Array.isArray(value) && probe.reduce === 'sum') value = value.reduce((a, b) => a + (Number(b) || 0), 0);
    if (value === undefined) throw new Error(`path "${probe.path}" not found in response`);
  } else throw new Error(`unknown probe kind "${kind}"`);

  if ('expect' in probe) {
    const ok = JSON.stringify(value) === JSON.stringify(probe.expect) || String(value) === String(probe.expect);
    return { value, confirmed: ok, numeric: false, detail: `${probe.path || 'value'} = ${JSON.stringify(value)}${ok ? '' : ` (expected ${JSON.stringify(probe.expect)})`}` };
  }
  if (probe.match) {
    const ok = new RegExp(probe.match, 'i').test(String(value));
    return { value, confirmed: ok, numeric: false, detail: `${probe.path || 'value'} = ${JSON.stringify(value)}${ok ? '' : ` (does not match /${probe.match}/)`}` };
  }
  if (probe.format === 'number') {
    const n = typeof value === 'number' ? value : firstNumber(value);
    if (n == null) throw new Error(`value ${JSON.stringify(value)} is not a number`);
    return { value: n, numeric: true, detail: `${probe.path || 'value'} = ${n}` };
  }
  return { value, confirmed: value != null && value !== '' && value !== false, numeric: false, detail: `${probe.path || 'value'} = ${JSON.stringify(value)}` };
}

function today(now) {
  const d = now || new Date();
  if (Number.isNaN(d.getTime())) throw new Error(`FUND_NOW="${process.env.FUND_NOW}" is not a date (use e.g. 2026-10-01)`);
  return d.toISOString().slice(0, 10);
}

/**
 * Refresh facts. Returns { results: [{ id, label, outcome: CONFIRMED|DRIFT|FAILED|SKIPPED, detail, from?, to?, written }], wrote }.
 */
export async function refreshFacts({ facts: factsFile, sources: sourcesFile, only, offline = false, write = false, now, timeoutMs, fetchImpl, concurrency = 6 } = {}) {
  const fp = factsPath(factsFile);
  today(now); // fail fast on an invalid FUND_NOW before fetching anything
  const rows = readFactRows(fp);
  const sources = loadSources(sourcesFile);
  const ids = Object.keys(sources).filter((id) => !only?.length || only.includes(id)).sort();
  const results = [];
  const unknownOnly = (only || []).filter((id) => !sources[id]);
  for (const id of unknownOnly) results.push({ id, label: rows.get(id)?.label || '', outcome: 'FAILED', detail: rows.has(id) ? 'no probe in facts/sources.json' : 'no such fact in FACTS.md', written: false });

  const tasks = ids.map((id) => async () => {
    const probe = sources[id];
    const row = rows.get(id);
    const base = { id, label: row?.label || '', untested: !!probe.untested, url: probe.url };
    if (!row) return { ...base, outcome: 'FAILED', detail: 'probe refers to a fact not in FACTS.md', written: false };
    if (row.status === 'retired') return { ...base, outcome: 'SKIPPED', detail: 'retired fact', written: false };
    if (offline) return { ...base, outcome: 'SKIPPED', detail: `offline — would ${probe.kind || 'json'} ${probe.url}`, written: false };
    let r;
    try { r = await runProbe(probe, { timeoutMs: timeoutMs ?? Number(process.env.FUND_REFRESH_TIMEOUT_MS || 15000), fetchImpl }); }
    catch (e) { return { ...base, outcome: 'FAILED', detail: e.name === 'AbortError' ? 'timeout' : (e.cause?.code || e.message), written: false }; }
    if (r.numeric) {
      const cur = firstNumber(row.value);
      if (cur === r.value) return { ...base, outcome: 'CONFIRMED', detail: r.detail, from: row.value, to: row.value, patch: { date: today(now), status: 'verified' } };
      const decreased = probe.monotonic === 'increasing' && cur != null && r.value < cur;
      const to = replaceFirstNumber(row.value, r.value);
      return { ...base, outcome: 'DRIFT', detail: `${row.value} → ${to}${decreased ? ' (decreased on a monotonic counter — not written, check the source)' : ''}`, from: row.value, to, patch: decreased ? null : { value: to, date: today(now), status: 'verified' } };
    }
    if (r.confirmed) return { ...base, outcome: 'CONFIRMED', detail: r.detail, patch: { date: today(now), status: 'verified' } };
    return { ...base, outcome: 'DRIFT', detail: `${r.detail} — fact may no longer hold; edit FACTS.md by hand`, patch: null };
  });

  // bounded parallelism
  const out = new Array(tasks.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
    while (next < tasks.length) { const i = next++; out[i] = await tasks[i](); }
  }));

  let text = readFileSync(fp, 'utf8');
  let wrote = 0;
  for (const r of out) {
    r.written = false;
    if (write && r.patch && (r.outcome === 'CONFIRMED' || r.outcome === 'DRIFT')) {
      text = updateFactRow(text, r.id, r.patch);
      r.written = true;
      wrote++;
    }
    delete r.patch;
    results.push(r);
  }
  if (wrote) writeFileSync(fp, text);
  return { results, wrote, file: fp };
}
