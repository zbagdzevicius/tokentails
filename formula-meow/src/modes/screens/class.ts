/**
 * Class select for the Grand Prix: 50cc Kitten, 100cc Alley Cat, 150cc Zoomies, Mirror (150cc numbers on flipped
 * tracks). Each card shows the trophies won in it and, when locked, what unlocks it.
 */
import type { ScreenApi, ScreenHandle } from '../../core/app/screens';
import { screens } from '../../core/app/screens';
import { CUPS } from '../../content/cups';
import { h } from '../../ui/kit';
import { t } from '../../ui/i18n';
import { flow } from '../flow';
import type { ClassPick } from '../store';
import { classLabel, chip, focusFirst, frame, TROPHY, guardedBack } from './ui';

export const CLASS_BLURB: Record<ClassPick, string> = {
  0: 'Gentle rivals, room to learn',
  1: 'Faster, and the cats fight back',
  2: 'Full speed, sharp rivals',
  3: 'Full speed, every track flipped',
};

/** Time Trial (B14): no rivals on that screen, so the class cards talk about speed only. */
export const CLASS_BLURB_TT: Record<ClassPick, string> = {
  0: 'Gentle speed, easy bends',
  1: 'Faster: brake for hairpins',
  2: 'Top speed, drift every bend',
  3: 'Top speed, every track flipped',
};

export function classChips(onPick: (c: ClassPick) => void, selected: ClassPick | null, showTrophies: boolean, blurb: Record<ClassPick, string> = CLASS_BLURB): HTMLDivElement {
  const f = flow();
  const s = f.save;
  const row = h('div', { class: 'fm-m-chips fm-m-classes' });
  for (const c of [0, 1, 2, 3] as ClassPick[]) {
    const lock = c === 0 ? null : f.lock('class', c);
    // only the trophies won (B: "room to learn · ·" showed dots as empty placeholders)
    const trophies = showTrophies ? CUPS.map((cup) => TROPHY[s.trophies[`${cup.id}:${c}`] ?? 0] || '').join('') : '';
    row.append(chip(classLabel(c), () => onPick(c), { selected: selected === c, locked: lock, sub: lock ? undefined : `${t(blurb[c])}${trophies ? `  ${trophies}` : ''}`, act: `class-${c}` }));
  }
  return row;
}

export function mount(root: HTMLElement, _params: unknown, _api: ScreenApi): ScreenHandle {
  const f = flow();
  const fr = frame(root, { title: t('Grand Prix'), sub: t('Pick a class'), sheet: true });
  fr.body.append(
    classChips((c) => {
      f.update((s) => (s.last.cls = c));
      void screens.push('cup', { cls: c });
    }, f.save.last.cls, true),
  );
  fr.footer.remove();
  focusFirst(root, `[data-act="class-${f.save.last.cls}"]:not([aria-disabled])`);
  return { back: guardedBack };
}
