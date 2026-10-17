/**
 * "Your cats" (GDD 6.1 "More than one cat", 9.2): up to `maxCats` cats on cards with little previews. Tap a card to
 * make that cat the star, dress one up, add one (the maker opens into the next free slot), delete one (its face and
 * opener are forgotten and the later cats' photos shift down with them). At the cap a cheeky Club row calls
 * `onUpsell`. Resolves with the new list and the active index when the player taps Done. DOM + CSS only.
 */
import type { CatMakerResult, CatSpec, RenderApi } from '../types';
import { el, openCatMaker, patternLabel, type CatMakerOptions } from './CatMaker';
import { applySlotEffects, canAdd, canDelete, catsReducer, initCats, nextSlot, type CatsAction, type CatsState } from './cats-manager';
import { MAX_CAT_SLOTS, photoStore, type PhotoStore } from './photo-store';
import { mountPreview, type CatPreviewHandle, type PreviewFactory } from './preview';
import { injectStyles } from './styles';

export interface ManageOptions {
  cats: CatSpec[];
  active: number;
  maxCats: number;
  render: RenderApi;
  onUpsell?(): void;
  store?: PhotoStore;
  /** Cosmetics for the maker when adding / dressing up. */
  owned?: CatMakerOptions['owned'];
  /** Card previews: flat 2D drawings by default (five WebGL contexts would be four too many). */
  previewFactory?: PreviewFactory;
  /** The maker's own preview (tests stub it). */
  makerPreviewFactory?: PreviewFactory;
  /** Test seam: replaces the maker. */
  openMaker?(host: HTMLElement, opts: CatMakerOptions): Promise<CatMakerResult>;
}

export const UPSELL_TEXT = 'Keep all your cats in Club: up to 5';
const DELETE_ARM_MS = 3000;

const flat: PreviewFactory = () => {
  throw new Error('2d');
};

async function blobToCanvas(b: Blob): Promise<HTMLCanvasElement | null> {
  try {
    const bmp = await createImageBitmap(b);
    const c = document.createElement('canvas');
    c.width = bmp.width;
    c.height = bmp.height;
    c.getContext('2d')?.drawImage(bmp, 0, 0);
    bmp.close?.();
    return c;
  } catch {
    return null;
  }
}

export function manageCats(host: HTMLElement, opts: ManageOptions): Promise<{ cats: CatSpec[]; active: number }> {
  injectStyles();
  const store = opts.store ?? photoStore();
  const maker = opts.openMaker ?? openCatMaker;
  let state: CatsState = initCats(opts.cats, opts.active, opts.maxCats);
  let previews: CatPreviewHandle[] = [];
  let timers: ReturnType<typeof setTimeout>[] = [];
  let settled = false;
  let resolveFn: (r: { cats: CatSpec[]; active: number }) => void = () => undefined;
  const done = new Promise<{ cats: CatSpec[]; active: number }>((r) => (resolveFn = r));

  const root = el('div', { class: 'bcm', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Your cats', 'data-bcm': 'manage' });
  host.appendChild(root);

  const clear = (): void => {
    previews.forEach((p) => p.dispose());
    previews = [];
    timers.forEach((t) => clearTimeout(t));
    timers = [];
    root.replaceChildren();
  };

  const dispatch = async (a: CatsAction): Promise<void> => {
    const r = catsReducer(state, a);
    state = r.state;
    await applySlotEffects(store, r.effects);
    draw();
  };

  const runMaker = async (catIndex: number, initial?: CatSpec): Promise<void> => {
    root.hidden = true;
    clear();
    let res: CatMakerResult | null = null;
    try {
      res = await maker(host, {
        initial,
        fromLink: false,
        render: opts.render,
        catIndex,
        adding: !initial,
        owned: opts.owned,
        store,
        previewFactory: opts.makerPreviewFactory,
      });
    } catch {
      res = null;
    }
    root.hidden = false;
    if (settled) return;
    if (res && res.method !== 'skipped') {
      await dispatch(initial ? { type: 'replace', index: catIndex, spec: res.spec } : { type: 'add', spec: res.spec });
    } else draw();
  };

  function draw(): void {
    clear();
    const n = state.cats.length;
    const grid = el('div', { class: 'bcm-cats', role: 'list' });
    state.cats.forEach((cat, i) => {
      const isActive = i === state.active;
      const canvas = el('canvas', { 'aria-hidden': 'true' });
      const pick = el(
        'button',
        {
          class: 'bcm-card-pick',
          type: 'button',
          'aria-pressed': String(isActive),
          'aria-label': isActive ? `${cat.name}, the star` : `Make ${cat.name} the star`,
          'data-bcm': `cat-${i}`,
        },
        el('div', { class: 'bcm-card-art' }, canvas),
        el('div', { class: 'bcm-card-name', text: cat.name }),
        el('div', { class: 'bcm-card-sub', text: isActive ? '★ Starring' : patternLabel(cat.pattern) }),
      );
      const edit = el('button', { class: 'bcm-mini', type: 'button', 'data-bcm': `edit-${i}` }, 'Dress up');
      const del = el('button', { class: 'bcm-mini danger', type: 'button', 'data-bcm': `delete-${i}`, 'aria-label': `Delete ${cat.name}` }, 'Delete');
      del.disabled = !canDelete(state);
      const card = el('div', { class: `bcm-card${isActive ? ' on' : ''}`, role: 'listitem' }, pick, el('div', { class: 'bcm-card-row' }, edit, del));
      grid.append(card);

      const pv = mountPreview(canvas, cat, null, opts.previewFactory ?? flat);
      previews.push(pv);
      void store
        .get(i)
        .then(async (r) => {
          const f = r?.face?.texture ? await blobToCanvas(r.face.texture) : null;
          if (f) pv.update(cat, f);
        })
        .catch(() => undefined);

      pick.onclick = () => void dispatch({ type: 'switch', index: i });
      edit.onclick = () => void runMaker(i, cat);
      let armed = false;
      del.onclick = () => {
        if (!armed) {
          armed = true;
          del.textContent = 'Sure? Tap again';
          del.classList.add('armed');
          timers.push(
            setTimeout(() => {
              armed = false;
              del.textContent = 'Delete';
              del.classList.remove('armed');
            }, DELETE_ARM_MS),
          );
          return;
        }
        void dispatch({ type: 'delete', index: i });
      };
    });

    if (canAdd(state)) {
      const add = el(
        'button',
        { class: 'bcm-card add', type: 'button', 'data-bcm': 'add', role: 'listitem' },
        el('span', { class: 'bcm-plus', 'aria-hidden': 'true' }, '+'),
        el('span', { text: n === 0 ? 'Add your cat' : 'Add a cat' }),
      );
      add.onclick = () => void runMaker(nextSlot(state));
      grid.append(add);
    }

    const extras = el('div', { class: 'bcm-extras' });
    if (!canAdd(state)) {
      if (state.maxCats < MAX_CAT_SLOTS && opts.onUpsell) {
        const up = el(
          'button',
          { class: 'bcm-upsell', type: 'button', 'data-bcm': 'upsell' },
          el('span', { class: 'bcm-upsell-cats', 'aria-hidden': 'true' }, '🐈🐈‍⬛🐈'),
          el('span', {}, el('strong', { text: UPSELL_TEXT }), el('br'), el('small', { text: 'Every cat gets a face, a clip and a grudge.' })),
        );
        up.onclick = () => opts.onUpsell?.();
        extras.append(up);
      } else if (state.maxCats >= MAX_CAT_SLOTS) {
        extras.append(el('p', { class: 'bcm-note', text: 'Five cats. That’s not a household, that’s a gang.' }));
      } else {
        // review round 1: with no Club offer here (offline, or the player's first session) "1 of 1" said nothing
        // about how to get more cats
        extras.append(
          el(
            'p',
            { class: 'bcm-note', 'data-bcm': 'more-cats' },
            `Free players keep one cat. Chaos Club keeps up to ${MAX_CAT_SLOTS}, each with its own face and clips. `,
            el('span', { text: 'Tap Dress up to change a cat any time.' }),
          ),
        );
      }
    }

    const ok = el('button', { class: 'bcm-btn primary', type: 'button', 'data-bcm': 'manage-done' }, 'Done');
    ok.onclick = () => {
      if (settled) return;
      settled = true;
      clear();
      root.remove();
      resolveFn({ cats: state.cats.map((c) => ({ ...c })), active: state.active });
    };
    root.append(
      el(
        'div',
        { class: 'bcm-screen' },
        el('h1', { text: 'Your cats' }),
        el('p', { text: n > 1 ? `${n} of ${state.maxCats} · tap a cat to make them the star` : `${n} of ${state.maxCats} · one cat, maximum chaos` }),
        el('div', { class: 'bcm-scroll' }, grid, extras),
        el('div', { class: 'bcm-footer' }, ok),
      ),
    );
  }

  draw();
  return done;
}
