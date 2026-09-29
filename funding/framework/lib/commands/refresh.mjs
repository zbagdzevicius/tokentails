// fund refresh [--offline] [--only F-007,F-015] [--write] [--json]
// Re-check facts that have a machine source (facts/sources.json) and report DRIFT / CONFIRMED / FAILED.
// --write updates value, date and status of the probed rows in FACTS.md in place (no other row changes).
// FUND_FACTS / FUND_SOURCES override the file paths; FUND_REFRESH_TIMEOUT_MS the 15 s per-probe timeout.

import { refreshFacts } from '../facts-refresh.mjs';

const TAG = { CONFIRMED: '✓ CONFIRMED', DRIFT: '! DRIFT    ', FAILED: '✗ FAILED   ', SKIPPED: '- SKIPPED  ' };

export default {
  name: 'refresh',
  help: '[--offline] [--only F-007,..] [--write] — re-check facts that have a machine source (facts/sources.json)',
  booleanFlags: ['offline', 'write', 'json'],
  async run({ flags, core }) {
    if (flags.only === true) { console.error('usage: fund refresh --only F-007,F-015   (comma-separated fact ids)'); return 2; }
    const only = typeof flags.only === 'string' ? flags.only.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean) : undefined;
    const { results, wrote, file } = await refreshFacts({ only, offline: !!flags.offline, write: !!flags.write, now: core?.now?.() });
    if (flags.json) { console.log(JSON.stringify({ results, wrote, file }, null, 2)); }
    else {
      console.log(`\nfact refresh — ${results.length} probe(s)${flags.offline ? ' (offline: nothing fetched)' : ''}`);
      for (const r of results) {
        const extra = [r.untested ? 'untested probe' : '', r.written ? 'written' : ''].filter(Boolean).join(', ');
        console.log(`  ${TAG[r.outcome]} ${r.id}  ${r.label.slice(0, 44).padEnd(44)} ${r.detail}${extra ? `  [${extra}]` : ''}`);
      }
    }
    const count = (o) => results.filter((r) => r.outcome === o).length;
    const pendingDrift = results.filter((r) => r.outcome === 'DRIFT' && !r.written).length;
    if (!flags.json) {
      console.log(`\n${count('CONFIRMED')} confirmed, ${count('DRIFT')} drift, ${count('FAILED')} failed, ${count('SKIPPED')} skipped${wrote ? ` — ${wrote} row(s) written to ${file}` : ''}`);
      if (flags.offline) console.log('next: fund refresh            (fetch the sources above)');
      else if (pendingDrift && !flags.write) console.log('next: fund refresh --write    (update the drifted rows), then fund verify --all');
      else if (pendingDrift) console.log('next: edit the unwritten DRIFT rows in facts/FACTS.md by hand, then fund verify --all');
      else if (count('FAILED')) console.log('next: fix the FAILED probes in facts/sources.json (or check the source by hand), then fund refresh --only <ids>');
      else console.log(wrote ? 'next: fund verify --all       (prose numbers citing changed facts are flagged)' : 'next: fund refresh --write    (stamp today\'s date on confirmed facts)');
    }
    return count('FAILED') || pendingDrift ? 1 : 0;
  },
};
