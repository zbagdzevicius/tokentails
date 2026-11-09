// Medians of perf-ios-probe2.mjs runs (PERF-IOS §8): node perf-ios-probe2-agg.mjs <OUT_DIR> <labelA> <labelB> [c|w|g] (label prefix before -c1, -w1, -g1)
import fs from 'node:fs';
const [dir, A, B, suf = 'c'] = process.argv.slice(2);
const load = (pre) => fs.readdirSync(dir).filter((f) => f.startsWith(`pl-probe2-${pre}-${suf}`) && f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(`${dir}/${f}`, 'utf8')));
const med = (xs) => { const v = xs.filter((x) => typeof x === 'number' && !Number.isNaN(x)).sort((a, b) => a - b); if (!v.length) return null; const m = v.length >> 1; return v.length % 2 ? v[m] : +((v[m - 1] + v[m]) / 2).toFixed(2); };
const get = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const runsA = load(A), runsB = load(B);
console.log(`runs ${A}: ${runsA.length}, ${B}: ${runsB.length}`);
const metrics = ['drawnFps', 'drawnJsMs', 'jsMs.p95', 'jsMs.max', 'perDrawn.glCalls', 'perDrawn.draws', 'perDrawn.tris', 'perDrawn.shadowDraws', 'perDrawn.shadowTris', 'perDrawn.blendDraws', 'perDrawn.blendTris', 'perDrawn.progSwitches', 'perDrawn.uniforms', 'programsBound', 'gpuMs.p50', 'gpuMs.p95', 'heap.allocMBPerS', 'heap.gcPerS', 'cdp.scriptMsPerS', 'cdp.taskMsPerS', 'cdp.styleRecalcsPerS', 'cdp.styleMsPerS', 'cdp.layoutsPerS', 'cdp.layoutMsPerS', 'cdp.compositedLayers', 'cdp.layerPaintsPerS', 'cdp.nodes', 'c2d.pl-overhead.callsPerS', 'c2d.pl-overhead.msPerS', 'c2d.pl-overhead.px', 'c2d.pl-minimap.callsPerS', 'c2d.pl-minimap.msPerS', 'c2d.pl-skill-preview.callsPerS', 'c2d.pl-skill-preview.px', 'otherContexts.pl-skill-preview-canvas.drawsPerS', 'otherContexts.pl-skill-preview-canvas.trisPerS', 'audioNodesPerS', 'audioStartsPerS', 'audioLiveMax', 'mutPerS', 'cssAnims', 'cssInfinite', 'longtasks.n', 'longtasks.max', 'shaderMs', 'cpu.busyMsPerS', 'alloc.sampledMBPerS', 'dmgNodes'];
const wins = [...new Set([...runsA, ...runsB].flatMap((r) => Object.keys(r.windows)))];
for (const w of wins) {
  console.log(`\n## ${w}`);
  for (const m of metrics) {
    const a = med(runsA.map((r) => get(r.windows[w] ?? {}, m)));
    const b = med(runsB.map((r) => get(r.windows[w] ?? {}, m)));
    if (a == null && b == null) continue;
    console.log(`${m.padEnd(48)} ${String(a).padStart(10)} ${String(b).padStart(10)}`);
  }
  for (const [lab, runs] of [[A, runsA], [B, runsB]]) {
    const cats = {};
    for (const r of runs) for (const c of r.windows[w]?.cpu?.byCategory ?? []) (cats[c.k] ??= []).push(c.msPerDrawn);
    const rows = Object.entries(cats).map(([k, v]) => [k, med(v), med(runs.map((r) => r.windows[w]?.cpu?.byCategory?.find((c) => c.k === k)?.msPerS))]).sort((a, b) => b[2] - a[2]).slice(0, 22);
    if (rows.length) console.log(`  cpu ${lab} (ms/drawn, ms/s): ` + rows.map(([k, a, b]) => `${k}=${a}/${b}`).join('; '));
    const ac = {};
    for (const r of runs) for (const [k, v] of r.windows[w]?.alloc?.byCategoryKBs ?? []) (ac[k] ??= []).push(v);
    const arow = Object.entries(ac).map(([k, v]) => [k, med(v)]).sort((a, b) => b[1] - a[1]).slice(0, 14);
    if (arow.length) console.log(`  alloc ${lab} KB/s: ` + arow.map(([k, v]) => `${k}=${v}`).join('; '));
    const sites = {};
    for (const r of runs) for (const [k, v] of r.windows[w]?.alloc?.topSitesKBs ?? []) (sites[k] ??= []).push(v);
    const srow = Object.entries(sites).map(([k, v]) => [k, med(v), v.length]).sort((a, b) => b[1] - a[1]).slice(0, 22);
    if (srow.length) console.log(`  sites ${lab}:\n    ` + srow.map(([k, v, n]) => `${v} KB/s (${n}) ${k}`).join('\n    '));
    const fns = {};
    for (const r of runs) for (const [k, v] of r.windows[w]?.cpu?.topFns ?? []) (fns[k] ??= []).push(v);
    const frow = Object.entries(fns).map(([k, v]) => [k, med(v), v.length]).sort((a, b) => b[1] - a[1]).slice(0, 18);
    if (frow.length && w !== 'lobby') console.log(`  fns ${lab}:\n    ` + frow.map(([k, v, n]) => `${v} ms/s (${n}) ${k}`).join('\n    '));
    const mt = {};
    for (const r of runs) for (const [k, v] of r.windows[w]?.mutTop ?? []) (mt[k] ??= []).push(v);
    console.log(`  mut ${lab}: ` + Object.entries(mt).map(([k, v]) => [k, med(v)]).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k}=${v}`).join('; '));
    const au = {};
    for (const r of runs) for (const [k, v] of Object.entries(r.windows[w]?.audio ?? {})) (au[k] ??= []).push(v);
    console.log(`  audio ${lab}: ` + Object.entries(au).map(([k, v]) => `${k}=${med(v)}`).join('; '));
  }
}
for (const [lab, runs] of [[A, runsA], [B, runsB]]) {
  console.log(`\n## hitches ${lab}`);
  for (const r of runs) console.log(`  ${r.label}: programsTotal=${r.programsTotal} progs after live=${JSON.stringify(r.hitches?.progLog)} gaps>50=${JSON.stringify(r.hitches?.gaps)} longtasks=${JSON.stringify(r.hitches?.longtasks?.slice(0, 12))} shaderSlow=${JSON.stringify(r.hitches?.shaderSlow?.slice(0, 8))} browserSkipped=${r.browserSkipped ?? ''} errors=${(r.errors ?? []).length}`);
}
