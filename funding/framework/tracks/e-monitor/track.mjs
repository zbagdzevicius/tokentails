// Track E — Monitor, don't build. Watches funding sources and surfaces changes for the other tracks.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scan, summarize, changesMarkdown, KINDS } from './scanner.mjs';
import {
  loadPortfolio, savePortfolio, portfolioPath, parseTriageJson, exclusionReason, slugify, parseDate, DEFAULT_HOURS, TRACKS,
} from '../../lib/portfolio.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

function paths(core) {
  return {
    watchlist: process.env.FUND_E_WATCHLIST || join(HERE, 'watchlist.json'),
    state: process.env.FUND_E_STATE || join(HERE, 'state.json'),
    changes: process.env.FUND_E_CHANGES || join(core.PATHS.apps, 'E-CHANGES.md'),
    triageOut: process.env.FUND_E_TRIAGE || join(core.PATHS.apps, 'E-TRIAGE.md'),
    triage: join(HERE, 'prompts', 'triage.md'),
  };
}

const readJson = (f, fallback) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : fallback);
const now = (flags = {}) => new Date(flags.now || process.env.FUND_NOW || Date.now());
const asList = (v) => (Array.isArray(v) ? v : v ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : []);

function validateWatchlist(list) {
  const problems = [];
  const ids = new Set();
  for (const [i, s] of list.entries()) {
    if (!s.id) problems.push(`entry ${i} has no id`);
    if (ids.has(s.id)) problems.push(`duplicate id ${s.id}`);
    ids.add(s.id);
    if (!/^https?:\/\//.test(s.url || '')) problems.push(`${s.id}: url must start with http(s)://`);
    if (!KINDS.includes(s.kind)) problems.push(`${s.id}: kind "${s.kind}" not in ${KINDS.join(', ')}`);
    if (s.kind === 'wp-modified' && !s.extract) problems.push(`${s.id}: wp-modified needs extract: <page id>`);
    if (s.kind === 'html' && s.extract) { try { new RegExp(s.extract); } catch (e) { problems.push(`${s.id}: bad regex (${e.message})`); } }
  }
  return problems;
}

/** Run fn with console output captured (the scaffold chatter of `fund new` stays out of the summary). */
async function quietly(fn) {
  const lines = [];
  const orig = { log: console.log, error: console.error, warn: console.warn };
  console.log = console.error = console.warn = (...a) => lines.push(a.map(String).join(' '));
  try { return { value: await fn(), out: lines.join('\n') }; } finally { Object.assign(console, orig); }
}

const normUrl = (u) => String(u || '').trim().replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase();

/**
 * Turn triaged YES rows into applications + COND portfolio entries.
 * Skips non-YES rows, excluded programs (BGA, Mantle, SCF, Giveth), non-remote and investment/credit
 * offers, and anything already an application or portfolio entry (by slug, URL or program name).
 * → { results: [{ action: ADDED|DUPLICATE|EXCLUDED|SKIPPED|FAILED, slug, source, detail }], failed }
 */
export async function applyTriage(rows, { core, invoke, dry = false, now: t = new Date() }) {
  const doc = loadPortfolio();
  const results = [];
  const apps = core.listApps().map((slug) => { try { return { slug, url: normUrl(core.loadApp(slug).call.fm.url) }; } catch { return { slug, url: '' }; } });
  const seen = { slugs: new Set([...apps.map((a) => a.slug), ...doc.opportunities.map((o) => o.slug)]), urls: new Set([...apps.map((a) => a.url), ...doc.opportunities.map((o) => normUrl(o.url))].filter(Boolean)), programs: new Set(doc.opportunities.map((o) => String(o.program || '').toLowerCase())) };
  let failed = 0;
  let nextId = Math.max(0, ...doc.opportunities.map((o) => Number(o.id) || 0)) + 1;
  for (const row of rows) {
    const verdict = String(row?.opportunity || '').trim().toUpperCase();
    const base = { source: row?.source || '' };
    if (verdict !== 'YES') { results.push({ ...base, action: 'SKIPPED', slug: row?.source, detail: verdict || 'no verdict' }); continue; }
    const slug = slugify(row.program) || slugify(row.source);
    const ex = exclusionReason(row);
    if (!slug) { results.push({ ...base, action: 'SKIPPED', slug: row.source, detail: 'no program name' }); continue; }
    if (ex) { results.push({ ...base, action: 'EXCLUDED', slug, detail: ex }); continue; }
    const url = /^https?:\/\//.test(row.url || '') ? String(row.url).trim() : '';
    const program = String(row.program || row.source).trim();
    if (seen.slugs.has(slug) || (url && seen.urls.has(normUrl(url))) || seen.programs.has(program.toLowerCase())) {
      results.push({ ...base, action: 'DUPLICATE', slug, detail: 'already an application or portfolio entry' }); continue;
    }
    const dl = parseDate(row.deadline);
    const deadline = dl == null || Number.isNaN(dl) ? 'rolling' : String(row.deadline).trim();
    if (dl != null && !Number.isNaN(dl) && dl < t.getTime()) { results.push({ ...base, action: 'SKIPPED', slug, detail: `deadline ${deadline} passed` }); continue; }
    const letter = String(row.track || '').trim().toUpperCase().charAt(0);
    const track = TRACKS.includes(letter) ? letter : 'B';
    const argv = ['new', slug, '--track', track, '--program', program, '--deadline', deadline, ...(url ? ['--url', url] : [])];
    seen.slugs.add(slug); if (url) seen.urls.add(normUrl(url)); seen.programs.add(program.toLowerCase());
    if (!dry) {
      let code;
      let why = '';
      try { ({ value: code, out: why } = await quietly(() => invoke(argv))); } catch (e) { code = 1; why = e?.message || String(e); }
      const created = existsSync(join(core.appDir(slug), 'call.md'));
      if (code !== 0 && !created) {
        failed++;
        results.push({ ...base, action: 'FAILED', slug, detail: `fund new exited ${code}: ${String(why).trim().split('\n').pop() || ''}`.trim() });
        continue;
      }
      // Saved after every scaffold, so an interrupted run (AI or disk failure later in the batch)
      // never leaves an application without its portfolio entry.
      doc.opportunities.push({
        id: nextId++, program, track, slug, url, deadline, capital_mid_usd: null, success: null, framework_hours: DEFAULT_HOURS[track],
        verdict: 'COND',
        condition: 'Human check of the triaged call: confirm it is live, remote and a grant/prize/accelerator, then set capital_mid_usd, success and condition_met: true.',
        condition_met: false, frame: '',
        notes: `Added by e:triage --apply on ${t.toISOString().slice(0, 10)} from source ${row.source || '?'}: ${row.reason || ''}`.trim(),
      });
      savePortfolio(doc);
      if (code !== 0) { failed++; results.push({ ...base, action: 'FAILED', slug, detail: `fund new exited ${code} but created the application; added to the portfolio — run node bin/fund.mjs check ${slug}` }); continue; }
    }
    results.push({ ...base, action: 'ADDED', slug, detail: `${dry ? 'would run' : 'ran'}: node bin/fund.mjs ${argv.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' ')}` });
  }
  return { results, failed };
}

export default {
  id: 'E',
  name: 'Monitor, don\'t build',
  noLoop: 'Track E only watches sources; move the program to a build track first',
  defaultFrame: '',
  booleanFlags: ['apply'],

  checks: [
    ({ app, core }) => {
      const out = [];
      const { watchlist } = paths(core);
      const list = readJson(watchlist, []);
      const ids = new Set(list.map((s) => s.id));
      const watch = asList(app.call.fm.watch);
      if (!watch.length) out.push({ name: 'watch', level: 'warn', detail: 'no watchlist ids in call.md "watch:" — nothing will alert you' });
      else {
        const missing = watch.filter((w) => !ids.has(w));
        out.push(missing.length
          ? { name: 'watch', level: 'error', detail: `not in watchlist.json: ${missing.join(', ')} (add with e:add)` }
          : { name: 'watch', level: 'ok', detail: `${watch.length} source(s) watched` });
      }
      const rv = app.call.fm.revisit;
      if (!rv) out.push({ name: 'revisit', level: 'warn', detail: 'no "revisit:" date set' });
      else {
        const t = Date.parse(rv);
        if (Number.isNaN(t)) out.push({ name: 'revisit', level: 'error', detail: `unparseable revisit date "${rv}"` });
        else if (t <= now().getTime()) out.push({ name: 'revisit', level: 'warn', detail: `revisit date ${rv} has arrived — act, then move the application to another track or push the date` });
        else out.push({ name: 'revisit', level: 'ok', detail: `${Math.ceil((t - now().getTime()) / 86400000)} days to ${rv}` });
      }
      const problems = validateWatchlist(list);
      if (problems.length) out.push({ name: 'watchlist', level: 'error', detail: problems.join('; ') });
      return out;
    },
  ],

  commands: {
    'e:scan': {
      help: '[--only id,id] [--offline DIR] [--timeout MS] — fetch sources, diff against state, write E-CHANGES.md',
      async run({ flags, core }) {
        const p = paths(core);
        const list = readJson(p.watchlist, []);
        const problems = validateWatchlist(list);
        if (problems.length) { console.error(`watchlist.json problems:\n  ${problems.join('\n  ')}`); return 1; }
        const state = readJson(p.state, {});
        const only = asList(flags.only);
        const unknown = only.filter((id) => !list.some((s) => s.id === id));
        if (unknown.length) { console.error(`unknown id(s): ${unknown.join(', ')}`); return 2; }
        const t = now(flags);
        const { results, state: next } = await scan(list, state, {
          only, offlineDir: flags.offline, timeoutMs: flags.timeout ? Number(flags.timeout) : 15000, now: t,
        });
        writeFileSync(p.state, JSON.stringify(next, null, 2) + '\n');
        writeFileSync(p.changes, changesMarkdown(results, t));
        const order = { CHANGED: 0, NEW: 1, ERROR: 2, UNCHANGED: 3 };
        for (const r of [...results].sort((a, b) => order[a.status] - order[b.status])) {
          const d = summarize(r);
          console.log(`${r.status.padEnd(9)} ${r.src.id.padEnd(30)} ${d}`);
        }
        const count = (s) => results.filter((r) => r.status === s).length;
        console.log(`\n${count('CHANGED')} changed · ${count('NEW')} new · ${count('UNCHANGED')} unchanged · ${count('ERROR')} error(s)`);
        console.log(`wrote ${p.changes}`);
        if (count('CHANGED') || count('NEW')) console.log('next: node bin/fund.mjs e:triage --run');
        return 0;
      },
    },

    'e:triage': {
      help: '[--run] [--out FILE] [--apply [--from FILE] [--dry]] — AI: which changes are real opportunities; --apply scaffolds the YES rows',
      async run({ flags, core, runAI, invoke }) {
        const p = paths(core);
        let out;
        if (flags.apply && typeof flags.from === 'string') {
          if (!existsSync(flags.from)) { console.error(`no ${flags.from}`); return 1; }
          out = readFileSync(flags.from, 'utf8');
        } else {
          if (!existsSync(p.changes)) { console.error('no E-CHANGES.md yet — run e:scan first'); return 1; }
          if (flags.apply && !flags.run) { console.error('--apply needs --run (or --from FILE with a saved triage answer)'); return 2; }
          const prompt = core.render(readFileSync(p.triage, 'utf8'), {
            CHANGES: readFileSync(p.changes, 'utf8'),
            FACTS: readFileSync(core.PATHS.facts, 'utf8'),
            TRACKS: 'A build-once hackathons/grants (ShelterSplit) · B quick rolling forms · C large written proposals · D DAO proposals · E monitor',
          });
          out = flags.run ? runAI(prompt, { label: 'e-monitor/triage', model: 'haiku' }) : prompt;
          if (flags.out) writeFileSync(flags.out, out);
          else if (!flags.apply) process.stdout.write(out);
          if (!flags.run) console.error('\n(prompt only — add --run to send it to $FUND_AI_CMD)');
          if (flags.run && flags.apply && !flags.out) writeFileSync(p.triageOut, out);
        }
        if (!flags.apply) {
          if (flags.run) console.log(`\nnext: node bin/fund.mjs e:triage --run --apply   (scaffold the YES rows)`);
          return 0;
        }
        let rows;
        try { rows = parseTriageJson(out); } catch (e) {
          console.error(`${e.message} — the answer is saved in ${flags.out || p.triageOut}; fix it and re-apply with --from`);
          return 1;
        }
        const run = invoke || (await import('../../bin/fund.mjs')).main;
        const res = await applyTriage(rows, { core, invoke: run, dry: !!flags.dry, now: now(flags) });
        for (const r of res.results) console.log(`${r.action.padEnd(9)} ${String(r.slug || r.source || '').padEnd(32)} ${r.detail}`);
        const n = (a) => res.results.filter((r) => r.action === a).length;
        const passed = res.results.filter((r) => r.action === 'SKIPPED' && /passed$/.test(r.detail)).length;
        console.log(`\n${n('ADDED')} added · ${n('DUPLICATE')} duplicate · ${n('EXCLUDED')} excluded · ${n('SKIPPED') - passed} not YES${passed ? ` · ${passed} past deadline` : ''}${n('FAILED') ? ` · ${n('FAILED')} failed` : ''}${flags.dry ? ' · DRY RUN (nothing written)' : ''}`);
        if (n('ADDED')) console.log(`next: confirm each new COND entry in ${portfolioPath()} (set capital_mid_usd, success, "condition_met": true), then node bin/fund.mjs go`);
        else console.log('next: node bin/fund.mjs go');
        return res.failed ? 1 : 0;
      },
    },

    'e:add': {
      help: '<id> <url> --kind K [--extract X] [--item "{title}"] [--keywords a,b] [--feeds A-E|new] [--note ""]',
      async run({ args, flags, core }) {
        const [id, url] = args;
        if (!id || !url || !flags.kind) { console.error('usage: e:add <id> <url> --kind <json|html|rss|wp-modified|status>'); return 2; }
        const p = paths(core);
        const list = readJson(p.watchlist, []);
        if (list.some((s) => s.id === id)) { console.error(`${id} already exists`); return 1; }
        const entry = { id, url, kind: flags.kind };
        if (flags.extract) entry.extract = flags.extract;
        if (flags.item) entry.item = flags.item;
        if (flags.keywords) entry.keywords = asList(flags.keywords);
        entry.feeds_track = flags.feeds || 'new';
        if (flags.note) entry.note = flags.note;
        const problems = validateWatchlist([...list, entry]);
        if (problems.length) { console.error(problems.join('\n')); return 1; }
        list.push(entry);
        writeFileSync(p.watchlist, JSON.stringify(list, null, 2) + '\n');
        console.log(`added ${id}\nnext: node bin/fund.mjs e:scan --only ${id}`);
        return 0;
      },
    },

    'e:list': {
      help: 'list watched sources with their last check and last change',
      async run({ core }) {
        const p = paths(core);
        const list = readJson(p.watchlist, []);
        const state = readJson(p.state, {});
        for (const s of list) {
          const st = state[s.id];
          const last = st?.lastError ? `ERROR ${st.lastError}` : st?.lastChanged ? `changed ${st.lastChanged.slice(0, 10)}` : 'never scanned';
          console.log(`${s.id.padEnd(30)} ${s.kind.padEnd(11)} ${String(s.feeds_track || '').padEnd(4)} ${last}`);
        }
        return 0;
      },
    },

    'e:remind': {
      help: '[--now ISO] — Track E applications whose revisit date has arrived',
      async run({ flags, core }) {
        const t = now(flags).getTime();
        const due = [];
        for (const slug of core.listApps()) {
          const { call } = core.loadApp(slug);
          if (call.fm.track !== 'E' || !call.fm.revisit) continue;
          const r = Date.parse(call.fm.revisit);
          if (!Number.isNaN(r) && r <= t) due.push(`${slug}  (revisit ${call.fm.revisit}) — ${call.fm.next || ''}`);
        }
        if (!due.length) console.log('nothing due');
        else console.log(`due:\n  ${due.join('\n  ')}`);
        return 0;
      },
    },
  },

  onScaffold: async ({ slug }) => `next: set "watch:" and "revisit:" in applications/${slug}/call.md, then node bin/fund.mjs check ${slug}`,
};
