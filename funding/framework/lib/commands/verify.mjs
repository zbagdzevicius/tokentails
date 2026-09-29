// fund verify <slug> | --all [--offline] [--json]
// Deep objective verification; writes applications/<slug>/VERIFY.md; exits 1 on any error.
// FUND_FACTS / FUND_SOURCES override fact and probe files; FUND_VERIFY_TIMEOUT_MS the 10 s link timeout.

import { verify, printVerify, nextCommand } from '../verify.mjs';

export default {
  name: 'verify',
  help: '<slug> | --all [--offline] [--json] — deep check: pipeline evidence, links, fact age, secrets/PII, policy, cross-app; writes VERIFY.md',
  booleanFlags: ['all', 'offline', 'json'],
  async run({ args, flags, core, tracks, invoke }) {
    const slugs = flags.all ? core.listApps() : args;
    if (flags.all && !slugs.length) { console.log(`no applications in ${core.PATHS.apps}\nnext: fund new <slug> --track <A-E>`); return 0; }
    if (!slugs.length) { console.error('usage: fund verify <slug> | --all [--offline] [--json]'); return 2; }
    const unknown = slugs.filter((s) => !core.listApps().includes(s));
    if (unknown.length) { console.error(`no application(s): ${unknown.join(', ')} — see fund list`); return 2; }
    const { apps } = await verify({ slugs, core, tracks, offline: !!flags.offline, flags, invoke });
    const failed = apps.filter((a) => !a.ok);
    if (flags.json) console.log(JSON.stringify(apps, null, 2));
    else {
      for (const v of apps) printVerify(v);
      console.log(`\n${apps.length - failed.length}/${apps.length} verified${flags.offline ? ' (offline: links skipped)' : ''} — details in applications/<slug>/VERIFY.md`);
      if (failed.length) console.log(`next: ${nextCommand(failed[0])}`);
      else console.log(`next: ${slugs.length === 1 ? nextCommand(apps[0]) : 'fund queue'}`);
    }
    return failed.length ? 1 : 0;
  },
};
