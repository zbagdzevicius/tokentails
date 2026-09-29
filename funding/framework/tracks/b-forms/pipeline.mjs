// Track B pipeline — a short rolling form as one `fund run`.
//
//   form (HUMAN only while form.md is the stock template or an fm: value is missing)
//   → answer (b:answer --run) → fill (b:fill) → check → human-read → ready
//   → submit (HUMAN pastes fill.md into the live form) → record-submission
//
// done() reads form.md, answers.md, fill.md and the draft.md mirror only. Nothing here submits.

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolve, staleFiles, parseForm } from './track.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROSE = new Set(['text', 'longtext']);

// ---------- invoke a fund command, capture its output into a one-line message ----------

async function call(ctx, argv) {
  const lines = [];
  const orig = { log: console.log, error: console.error, warn: console.warn };
  const grab = (...a) => lines.push(a.map(String).join(' '));
  console.log = grab; console.error = grab; console.warn = grab;
  let code;
  try { code = await ctx.invoke(argv); } catch (e) { lines.push(`error: ${e.message}`); code = 1; } finally { Object.assign(console, orig); }
  return { code: code ?? 0, lines: lines.join('\n').split('\n').map((l) => l.trim()).filter(Boolean) };
}

function outcome(res, argv, okText) {
  const cmd = `fund ${argv.join(' ')}`;
  if (res.code === 0) return { ok: true, message: okText || `${cmd} ok` };
  const bad = res.lines.filter((l) => /^(✗|!|error|usage|no )/i.test(l)).slice(0, 3);
  const nx = res.lines.filter((l) => l.startsWith('next:')).pop();
  return { ok: false, message: `${cmd} exited ${res.code}: ${(bad.length ? bad : res.lines.slice(-1)).join('; ')}${nx ? ` — ${nx}` : ''}` };
}

// ---------- detectors ----------

const sig = (fields) => fields.map((f) => [f.id, f.label, f.type, f.limitRaw, f.required, f.sourceRaw].join('|')).join('\n');
let templateSig = null;
function isTemplate(fields) {
  if (templateSig === null) {
    try { templateSig = sig(parseForm(readFileSync(join(HERE, 'templates', 'form.md'), 'utf8')).fields); } catch { templateSig = ''; }
  }
  return !!templateSig && sig(fields) === templateSig;
}

const res = (ctx) => resolve(ctx.slug, { app: ctx.app });

/** Fields b:answer can work on: prose or select, not fm:, failing, no broken reference. */
function aiTargets(r) {
  return r.fields.filter((f) => (PROSE.has(f.type) || f.type === 'select') && f.source.kind !== 'fm' && !f.ok && !f.problems.some((p) => p.kind === 'ref'));
}

const brief = (fields) => fields.slice(0, 4).map((f) => `${f.id} (${f.problems.map((p) => p.kind).join('/') || 'empty'})`).join(', ');

// ---------- the pipeline ----------

export default function pipeline(defaultSteps) {
  const by = Object.fromEntries(defaultSteps.map((s) => [s.id, s]));

  const form = {
    id: 'form',
    title: 'Match form.md to the live form and set its fm: values in call.md',
    kind: 'human',
    estimate_h: 0.25,
    needs: [],
    optional: false,
    // The command depends on what is missing: form.md itself, an fm: value (a decision: no override),
    // or only the confirmation that the stock template matches the live form.
    command(ctx) {
      if (!ctx.app || !existsSync(join(ctx.dir, 'form.md'))) return 'fund b:new-form <slug> --fields "id:Label:text:140:yes;..."';
      const r = res(ctx);
      if (r.formErrors.length) return 'fund b:fill <slug>   # after fixing form.md (it lists the errors)';
      const fmMissing = r.fields.filter((f) => f.source.kind === 'fm' && f.required && !f.value).map((f) => `${f.source.key}:`);
      if (fmMissing.length) return `fund run <slug>   # after setting ${[...new Set(fmMissing)].join(', ')} in call.md`;
      return 'fund done <slug> form';
    },
    instructions: 'Open the live form (url in call.md) and make applications/<slug>/form.md list exactly its fields, labels and limits (or: fund b:new-form <slug> --fields "id:Label:text:140:yes;..." --force). Set ask: (plain number) and contact: (a role address) in call.md if the form uses them. If the stock template already matches the form: fund done <slug> form',
    done(ctx) {
      const file = join(ctx.dir, 'form.md');
      if (!existsSync(file)) return { done: false, reason: `no form.md — fund b:new-form ${ctx.slug} --fields "id:Label:text:140:yes;..."`, noOverride: true };
      const r = res(ctx);
      if (r.formErrors.length) return { done: false, reason: `form.md: ${r.formErrors.slice(0, 2).join('; ')}`, noOverride: true };
      const fmMissing = r.fields.filter((f) => f.source.kind === 'fm' && f.required && !f.value).map((f) => `${f.source.key}:`);
      if (fmMissing.length) return { done: false, reason: `set ${[...new Set(fmMissing)].join(', ')} in call.md (these are decisions, the AI never writes them)`, noOverride: true };
      if (isTemplate(r.fields)) return { done: false, reason: 'form.md is still the stock template — match it to the live form' };
      return { done: true, reason: `${r.fields.length} field(s) in form.md` };
    },
  };

  const answer = {
    id: 'answer',
    title: 'AI drafts every empty or failing answer into answers.md (b:answer --run)',
    kind: 'ai',
    estimate_h: 0.1,
    needs: ['form'],
    optional: false,
    done(ctx) {
      const r = res(ctx);
      if (!r.exists) return { done: false, reason: 'no form.md' };
      const all = aiTargets(r);
      const gaveUp = all.filter((f) => f.todo);
      const todo = all.filter((f) => !f.todo);
      if (todo.length) return { done: false, reason: `${todo.length} answer(s) to draft: ${brief(todo)}` };
      return { done: true, reason: gaveUp.length ? `AI could not answer ${gaveUp.map((f) => f.id).join(', ')} from the facts — write them by hand in answers.md` : 'every answer field resolves' };
    },
    async run(ctx) {
      const argv = ['b:answer', ctx.slug, '--run'];
      const out = await call(ctx, argv);
      const line = out.lines.find((l) => l.startsWith('answers.md:'));
      return outcome(out, argv, line || 'answers.md updated');
    },
  };

  const fill = {
    id: 'fill',
    title: 'Write the paste sheet fill.md and the draft.md mirror, enforce limits (b:fill)',
    kind: 'auto',
    estimate_h: 0,
    needs: ['answer'],
    optional: false,
    done(ctx) {
      const r = res(ctx);
      if (!r.exists) return { done: false, reason: 'no form.md' };
      const failing = r.fields.filter((f) => !f.ok);
      if (r.formErrors.length || failing.length) return { done: false, reason: `${failing.length} field(s) not ready: ${brief(failing)}${failing.some((f) => f.todo) ? ' — finish the TODO answers by hand' : ''}` };
      const stale = staleFiles(r);
      return stale.length ? { done: false, reason: `${stale.join(' and ')} out of date` } : { done: true, reason: `${r.fields.length}/${r.fields.length} fields ready, fill.md current` };
    },
    async run(ctx) {
      const argv = ['b:fill', ctx.slug];
      const out = await call(ctx, argv);
      const line = out.lines.find((l) => l.startsWith('wrote '));
      if (out.code === 0) return { ok: true, message: line || 'wrote fill.md' };
      const bad = out.lines.filter((l) => l.startsWith('✗')).slice(0, 3).join('; ');
      return { ok: false, message: `fund b:fill ${ctx.slug} exited ${out.code}: ${bad || out.lines.slice(-1)[0] || ''}` };
    },
    verify(ctx) {
      const r = res(ctx);
      const failing = r.fields.filter((f) => !f.ok);
      if (failing.length) return { level: 'error', detail: `${failing.length} field(s) not ready: ${brief(failing)}` };
      const stale = staleFiles(r);
      return stale.length ? { level: 'warn', detail: `${stale.join(', ')} out of date — fund b:fill ${ctx.slug}` } : { level: 'ok', detail: 'fill.md current' };
    },
  };

  const check = { ...by.check, needs: ['fill'] };

  const humanRead = {
    ...by['human-read'],
    needs: ['check'],
    instructions: 'Read applications/<slug>/fill.md top to bottom next to the live form: every answer true, inside its limit, nothing a partner would object to. Fix answers.md or call.md if needed (fund run <slug> re-fills). When you would sign it: fund done <slug> human-read',
  };

  const ready = { ...by.ready, needs: ['human-read', 'check'] };

  const submit = {
    ...by.submit,
    title: 'Paste fill.md into the live form and submit',
    instructions: 'Open the form (url in call.md), paste each copy block from applications/<slug>/fill.md into its field, press submit yourself and keep the confirmation. Then: fund done <slug> submit',
  };

  return [form, answer, fill, check, humanRead, ready, submit, by['record-submission']];
}
