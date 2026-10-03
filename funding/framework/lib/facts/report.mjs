// `fund facts report`: the date-dependent checks that never run on pull requests (plan F1, F7, G11).
// The weekly workflow (.github/workflows/facts-weekly.yml) runs it and opens or updates one issue.
//
//   staleness       entries whose checkedAt is older than maxAgeDays (surfaced ones are problems)
//   goals           campaign goals that have ended, that run without counting (no shelter wallet or
//                   fromBlock), that count from too early (a wallet with no fromBlock), or that
//                   cannot be met in the days left at the cap
//   evidence        product claims whose spec now exists (ready to verify and surface)
//   reconciliation  machine probes in facts/sources.json (chain counters, store listings), the
//                   live impact snapshot when FACTS_IMPACT_URL is set, and (online) that the
//                   campaign fromBlock is the first block of its startDate
//
// buildReport({ root, now, offline, fetchImpl, impactUrl }) -> { problems, notes, sections, markdown }

import { join } from 'node:path';
import { refreshFacts } from '../facts-refresh.mjs';
import { TARGETS, formatUnits, goalFeasibility, loadRegistry, parseUnits } from './build.mjs';
import { endOfDate, inclusiveDays } from './schema.mjs';
import { existsSync } from 'node:fs';

const DAY = 86400000;

function dig(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export function staleness(registry, now) {
  const out = [];
  for (const f of registry.facts) {
    if (f.status === 'retired' || f.maxAgeDays == null || f.status === 'live') continue;
    const checked = endOfDate(f.checkedAt);
    if (!checked) { out.push({ id: f.id, surfaced: f.surfaces.length > 0, detail: `checkedAt "${f.checkedAt}" is not a date` }); continue; }
    const age = Math.floor((now - checked) / DAY);
    if (age > f.maxAgeDays) out.push({ id: f.id, surfaced: f.surfaces.length > 0, age, detail: `checked ${f.checkedAt}, ${age} days ago (max ${f.maxAgeDays})` });
  }
  return out;
}

/** "2026-12-30" minus n days, as a date string. */
function minusDays(date, n) {
  return new Date(Date.parse(`${date}T00:00:00Z`) - n * DAY).toISOString().slice(0, 10);
}

/**
 * Where each goal stands today. Offline the report cannot see the amount raised, so it checks what
 * it can prove: the campaign must be counting (shelter wallet and fromBlock set) once the goal has
 * started, and it must have started counting by the last day that still leaves `minDays` at the cap.
 * While it runs, the note gives the least the payouts page must already show for the goal to be
 * reachable in the days left.
 */
export function goalStatus(registry, now, root) {
  const out = [];
  const today = new Date(now).toISOString().slice(0, 10);
  for (const f of registry.facts) {
    if (!f.goal) continue;
    const r = goalFeasibility(f, root);
    const { decimals } = f.goal.cap;
    const cap = parseUnits(r.capPerDay, decimals);
    const target = parseUnits(f.value, decimals);
    const lastStart = Number.isFinite(r.minDays) ? minusDays(f.goal.endDate, r.minDays - 1) : null;
    const counting = !f.campaign || (f.campaign.shelter?.wallet && f.campaign.fromBlock != null);
    const missing = f.campaign ? [!f.campaign.shelter?.wallet && 'shelter.wallet', f.campaign.fromBlock == null && 'fromBlock'].filter(Boolean).join(' and ') : '';
    // A wallet without fromBlock is not "nothing counts": campaignProgress then counts every payout
    // ever made to the wallet, including ones before startDate. The schema refuses it too.
    if (f.campaign?.shelter?.wallet && f.campaign.fromBlock == null) {
      out.push({ id: f.id, problem: true, detail: `campaign.shelter.wallet is set but fromBlock is null, so /shelter-payouts is counting every payout to the wallet, including ones before startDate (${f.goal.startDate}). Set campaign.fromBlock to the first block on or after ${f.goal.startDate} in facts.json and rebuild.` });
      continue;
    }
    if (today > f.goal.endDate) {
      out.push({ id: f.id, problem: true, detail: `goal ended on ${f.goal.endDate}: replace or retire it` });
    } else if (today >= f.goal.startDate) {
      const left = inclusiveDays(today, f.goal.endDate);
      const reachable = cap * BigInt(left);
      if (!counting) {
        const why = reachable < target
          ? `cannot be met: ${left} days left at ${r.capPerDay} ${f.unit}/day is at most ${formatUnits(reachable, decimals)} ${f.unit}, and nothing is counted yet`
          : `the campaign has no ${missing}, so no payout counts toward it; it must be counting by ${lastStart} to stay reachable`;
        out.push({ id: f.id, problem: true, detail: `running since ${f.goal.startDate}, but ${why}. Set ${missing.split(' and ').map((m) => `campaign.${m}`).join(' and ')} in facts.json (or move the goal dates) and rebuild.` });
      } else {
        const need = target > reachable ? target - reachable : 0n;
        const tail = need > 0n
          ? ` It is reachable only if /shelter-payouts already shows at least ${formatUnits(need, decimals)} ${f.unit} raised; if not, lower the goal or extend endDate.`
          : '';
        out.push({ id: f.id, problem: false, detail: `running: ${left} of ${r.days} days left; at most ${r.capPerDay} ${f.unit}/day (${formatUnits(reachable, decimals)} ${f.unit} more). Goal ${f.value} ${f.unit}.${tail}` });
      }
    } else {
      const late = !counting ? ` Not counting yet (no ${missing}); it must be counting by ${lastStart}.` : '';
      out.push({ id: f.id, problem: false, detail: `starts ${f.goal.startDate}; ${r.goal} ${f.unit} needs ${r.minDays} of ${r.days} days at the cap (${r.spareDays} spare).${late}` });
    }
  }
  return out;
}

export function evidenceStatus(registry, root) {
  return registry.facts
    .filter((f) => f.evidence?.spec && f.status === 'unverified' && existsSync(join(root, f.evidence.spec)))
    .map((f) => ({ id: f.id, detail: `${f.evidence.spec} exists: once it passes in CI, set ${f.id} verified and add its surface` }));
}

export async function impactReconciliation(registry, { impactUrl, fetchImpl = fetch, now }) {
  const live = registry.facts.filter((f) => f.status === 'live' && f.live?.endpoint === '/impact');
  if (!impactUrl) return { skipped: 'FACTS_IMPACT_URL is not set (the impact snapshot is not published yet)', items: [] };
  const items = [];
  let snap;
  try {
    const res = await fetchImpl(impactUrl, { headers: { accept: 'application/json' } });
    if (!res.ok) return { items: [{ id: 'impact', problem: true, detail: `${impactUrl}: HTTP ${res.status}` }] };
    snap = await res.json();
  } catch (e) {
    return { items: [{ id: 'impact', problem: true, detail: `${impactUrl}: ${e.message}` }] };
  }
  const asOf = Date.parse(snap?.asOf);
  if (!Number.isFinite(asOf)) items.push({ id: 'impact', problem: true, detail: 'snapshot has no asOf' });
  if (snap?.sources?.chain === 'error') items.push({ id: 'impact', problem: true, detail: 'snapshot reports sources.chain = "error" (RPC failure; totals carried forward)' });
  for (const f of live) {
    const v = dig(snap, f.live.path);
    if (v === undefined || v === null) items.push({ id: f.id, problem: true, detail: `snapshot has no ${f.live.path}` });
    else if (Number.isFinite(asOf) && (now - asOf) / DAY > f.maxAgeDays) items.push({ id: f.id, problem: true, detail: `snapshot is older than ${f.maxAgeDays} days (asOf ${snap.asOf})` });
  }
  return { items };
}

// Public RPCs for the campaign chains, mirroring client/components/shelter-payouts/chains.ts.
export const CAMPAIGN_RPCS = { 5042: 'https://rpc.mainnet.arc.io', 5042002: 'https://rpc.testnet.arc.io' };

async function blockTime(rpc, n, fetchImpl) {
  const res = await fetchImpl(rpc, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: [`0x${n.toString(16)}`, false] }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  if (!j?.result?.timestamp) throw new Error(`block ${n} not found`);
  return parseInt(j.result.timestamp, 16);
}

/**
 * Chain reconciliation for the campaign start: fromBlock must be the first block on or after
 * goal.startDate (00:00 UTC). Too early counts payouts from before the goal; too late drops some.
 */
export async function fromBlockReconciliation(registry, { fetchImpl = fetch, rpcs = CAMPAIGN_RPCS } = {}) {
  const items = [];
  for (const f of registry.facts) {
    const c = f.campaign;
    if (!c || !f.goal || c.fromBlock == null) continue;
    const rpc = rpcs[c.chainId];
    if (!rpc) { items.push({ id: f.id, problem: true, detail: `no RPC known for chain ${c.chainId}; cannot check fromBlock ${c.fromBlock}` }); continue; }
    const start = Date.parse(`${f.goal.startDate}T00:00:00Z`) / 1000;
    try {
      const at = await blockTime(rpc, c.fromBlock, fetchImpl);
      const before = c.fromBlock > 0 ? await blockTime(rpc, c.fromBlock - 1, fetchImpl) : -Infinity;
      if (at < start) items.push({ id: f.id, problem: true, detail: `fromBlock ${c.fromBlock} is before startDate ${f.goal.startDate} (block time ${new Date(at * 1000).toISOString()}), so payouts from before the goal count` });
      else if (before >= start) items.push({ id: f.id, problem: true, detail: `fromBlock ${c.fromBlock} is after the first block of ${f.goal.startDate} (block ${c.fromBlock - 1} is at ${new Date(before * 1000).toISOString()}), so early payouts are dropped` });
      else items.push({ id: f.id, problem: false, detail: `fromBlock ${c.fromBlock} is the first block on chain ${c.chainId} at or after ${f.goal.startDate}T00:00:00Z` });
    } catch (e) {
      items.push({ id: f.id, problem: true, detail: `fromBlock check failed on chain ${c.chainId}: ${e.message}` });
    }
  }
  return items;
}

/** Lines as a fenced text block that outside text cannot close. */
export function codeBlock(lines) {
  return ['```text', ...lines.map((l) => String(l).replace(/`/g, "'")), '```'];
}

export async function buildReport({ root, now = Date.now(), offline = false, fetchImpl, impactUrl, refresh = refreshFacts } = {}) {
  const registry = loadRegistry(root);
  const problems = [];
  const notes = [];
  const sections = [];

  const stale = staleness(registry, now);
  for (const s of stale) (s.surfaced ? problems : notes).push(`${s.id} stale${s.surfaced ? ' (shown publicly)' : ''}: ${s.detail}`);
  sections.push(['Staleness', stale.length ? stale.map((s) => `- ${s.surfaced ? '**' : ''}${s.id}${s.surfaced ? ' (surfaced)**' : ''}: ${s.detail}`) : ['- Every fact is within its maxAgeDays.']]);

  const goals = goalStatus(registry, now, root);
  for (const g of goals) (g.problem ? problems : notes).push(`${g.id}: ${g.detail}`);
  sections.push(['Goals', goals.length ? goals.map((g) => `- ${g.problem ? '**' : ''}${g.id}${g.problem ? '**' : ''}: ${g.detail}`) : ['- No goals.']]);

  const ev = evidenceStatus(registry, root);
  for (const e of ev) notes.push(`${e.id}: ${e.detail}`);
  if (ev.length) sections.push(['Evidence ready', ev.map((e) => `- ${e.id}: ${e.detail}`)]);

  // Machine probes: the same engine as `fund refresh` (never writes here).
  let probeLines;
  try {
    const { results } = await refresh({ facts: join(root, TARGETS.factsMd), sources: join(root, 'funding/framework/facts/sources.json'), offline, write: false, fetchImpl, now: new Date(now) });
    probeLines = results.map((r) => `- ${r.outcome} ${r.id}: ${r.detail}`);
    for (const r of results) if (r.outcome === 'DRIFT' || r.outcome === 'FAILED') problems.push(`${r.id} probe ${r.outcome}: ${r.detail}`);
  } catch (e) {
    probeLines = [`- probes could not run: ${e.message}`];
    problems.push(`probes could not run: ${e.message}`);
  }
  const imp = await impactReconciliation(registry, { impactUrl, fetchImpl, now });
  const impLines = imp.skipped ? [`- impact snapshot: skipped (${imp.skipped})`] : imp.items.length ? imp.items.map((i) => `- ${i.id}: ${i.detail}`) : ['- impact snapshot: every live metric is present and fresh.'];
  for (const i of imp.items) if (i.problem) problems.push(`${i.id}: ${i.detail}`);
  const blocks = offline ? [] : await fromBlockReconciliation(registry, { fetchImpl: fetchImpl || fetch });
  const blockLines = offline ? ['- campaign fromBlock: skipped (offline)'] : blocks.length ? blocks.map((b) => `- ${b.id}: ${b.detail}`) : ['- campaign fromBlock: none set'];
  for (const b of blocks) if (b.problem) problems.push(`${b.id}: ${b.detail}`);
  // Probe details quote outside sites (stellar.expert, the app stores): the issue shows them as
  // plain text in a code block, with backticks removed, so they can't add markup, links or mentions.
  sections.push(['Reconciliation', [...probeLines, ...impLines, ...blockLines], { code: true }]);

  const day = new Date(now).toISOString().slice(0, 10);
  const markdown = [
    `# Facts weekly report (${day})`,
    '',
    problems.length ? `**${problems.length} problem(s)** need a person. Fix them in \`funding/framework/facts/facts.json\`, then run \`node funding/framework/bin/fund.mjs facts build\`.` : 'No problems.',
    '',
    ...sections.flatMap(([title, lines, opts]) => [`## ${title}`, '', ...(opts?.code ? codeBlock(lines) : lines), '']),
  ].join('\n');
  return { problems, notes, sections, markdown };
}
