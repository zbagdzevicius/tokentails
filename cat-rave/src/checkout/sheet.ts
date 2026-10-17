/**
 * F-CHECKOUT: the in-page checkout sheet (CHECKOUT-SPEC.md sections 3, 7, 8). Mounted by the HUD's
 * Add-a-cat sheet when GET /rave/status says `enabled: true`; otherwise the HUD keeps today's sheet.
 *
 *   build  →  pick $1 / $5 / custom (≥ $10), name the cats, optional X handle, Card | USDC, fee toggle
 *   pay    →  Stripe Payment Element (card, Apple Pay, Google Pay, Link), 3DS in Stripe's own modal
 *   wallet →  USDC gift from the injected wallet with the order memo, then POST usdc-tx
 *   done   →  "Your N cats are arriving" with their names; onPaid() starts the floor's arrival
 *
 * Never navigates away. All user text goes in with textContent; there is no innerHTML here.
 */
import './checkout.css';
import { explorerTx, CHAINS as RAVE_CHAINS } from '../config';
import { catsLabel, formatCents, parseCustom, quote, isValidCats } from './amount';
import type { PriceRules } from './amount';
import { RaveApiError, newClientKey } from './api';
import type { RaveApi } from './api';
import { createCountryPicker } from './country';
import { addMyOrder } from './myorders';
import { CAT_NAME_MAX_LENGTH, checkNames, expandNames, nameFieldCount, nameMessage, namesSummary, NAME_EXAMPLE, SURPRISE_PLACEHOLDER } from './names';
import { declineNextStep, mountPaymentElement } from './stripe';
import type { ConfirmOutcome, MountedPayment } from './stripe';
import type { CheckoutAnswer, CheckoutRequest, PaidOrder, RaveMethod, RaveOrderRow, RaveStatusOn } from './types';
import { giveUsdc, injectedProvider, loadDeployments, loadSdk, usdcChoices, walletMessage } from './usdc';
import type { UsdcChoice } from './usdc';
import { X_HANDLE_MESSAGES, normalizeXHandle, xLink } from './xhandle';

export interface CheckoutOptions {
  api: RaveApi;
  status: RaveStatusOn;
  /** Payment went through (card succeeded/processing, or the USDC tx was sent). Start the arrival. */
  onPaid?: (order: PaidOrder) => void;
  /** Every fresh read of the buyer's order while the success screen is open. */
  onOrderUpdate?: (row: RaveOrderRow) => void;
  /** "Watch them land": the page closes the sheet. */
  onDone?: () => void;
  /** Placeholder shuffle seed (tests); random by default. */
  seed?: number;
  /**
   * The buyer's IP country (`fetchGeoCountry(api)`): a code hides the picker, null shows it. Falls back to
   * `status.country` when the status carries one; with neither the picker stays hidden (the server sets
   * the country from the IP on its own).
   */
  country?: string | null | Promise<string | null>;
  /** Picker memory (localStorage); none in tests. */
  storage?: (Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>) | null;
}

export interface MountedCheckout {
  /** The sheet opened again: after a finished purchase it starts on a fresh build step. */
  onOpen(): void;
  destroy(): void;
}

type Step = 'build' | 'pay' | 'wallet' | 'done';
type Choice = number | 'custom';

const HOLO_MAX = 12;
const PREVIEW_MAX = 15;
const QUICK_CUSTOM = [10, 25, 50, 100];

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

let uid = 0;

export function mountCheckout(container: HTMLElement, opts: CheckoutOptions): MountedCheckout {
  const { api, status } = opts;
  const id = `rvc${++uid}`;
  const rules: PriceRules = { fixed: status.prices.fixed, customMin: status.prices.customMin, max: status.prices.max };
  const fixedOptions = rules.fixed.filter((n) => n >= 1 && n <= rules.max).slice(0, 2);
  const customAllowed = rules.customMin <= rules.max;
  const usdcEnabled = status.usdc.enabled && status.usdc.chains.length > 0;
  const cardEnabled = status.card;

  // ------------------------------------------------------------------ state
  let destroyed = false;
  let step: Step = 'build';
  let choice: Choice = fixedOptions.includes(5) ? 5 : fixedOptions[0] ?? 'custom';
  let customCats = Math.min(rules.max, Math.max(rules.customMin, 10));
  let customOk = true;
  let method: RaveMethod = cardEnabled ? 'card' : 'usdc';
  let coverFee = true;
  let busy = false;
  let clientKey = newClientKey();
  let lastBody = '';
  let answer: CheckoutAnswer | null = null;
  let payment: MountedPayment | null = null;
  let usdcList: UsdcChoice[] | null = null;
  let usdcPick: UsdcChoice | null = null;
  let usdcLoading = false;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingUsdcReport: { chainId: number; txHash: string } | null = null;
  /** The order the done-screen poll follows (it keeps following it after "Add more cats"). */
  let pollOrderId: string | null = null;
  /** The last finished order, for the slim "Mochi landed ✓" note on a fresh build step. */
  let lastDone: { names: string[]; cats: number; status: string } | null = null;
  const touched = new Set<string>();

  const cats = () => (choice === 'custom' ? customCats : choice);
  const catsOk = () => (choice === 'custom' ? customOk : true) && isValidCats(cats(), rules);

  // ------------------------------------------------------------------ root
  const root = h('div', 'rvc');
  root.dataset.step = step;
  const title = h('h2', 'rv-display rvc-title', 'Add a cat 🐾');
  title.id = `${id}-title`;
  title.tabIndex = -1;
  root.setAttribute('role', 'region');
  root.setAttribute('aria-labelledby', title.id);
  const lede = h('p', 'rvc-lede', 'Every $1 paid out to the Pink Paw shelter on-chain is one dancing cat. Name yours.');
  root.append(title, lede);
  if (status.payoutsDelayed) {
    root.append(h('p', 'rvc-banner', 'Payouts are running slow right now. Your cats will still arrive, just a little later.'));
  }
  const testBanner = h('p', 'rvc-banner rvc-test', 'Test mode: use a Stripe test card. No real money moves.');
  testBanner.hidden = status.livemode;
  root.append(testBanner);

  // ================================================================== step: build
  const build = h('section', 'rvc-step rvc-build');
  const landed = h('p', 'rvc-landed');
  landed.setAttribute('aria-live', 'polite');
  landed.hidden = true;

  // -- amount cards
  const optsRow = h('div', 'rvc-opts');
  optsRow.setAttribute('role', 'radiogroup');
  optsRow.setAttribute('aria-label', 'How many cats');
  const optButtons = new Map<Choice, HTMLButtonElement>();
  let oneFee: HTMLSpanElement | null = null;
  /** "34¢" under a dollar, "$1.20" above. */
  const feeCentsText = (cents: number) => (cents < 100 ? `${Math.max(0, Math.round(cents))}¢` : formatCents(cents));
  const addOpt = (c: Choice, big: string, small: string, badge?: string) => {
    const b = h('button', 'rvc-opt');
    b.type = 'button';
    b.setAttribute('role', 'radio');
    const bb = h('span', 'rvc-opt-big rv-display', big);
    const ss = h('span', 'rvc-opt-small', small);
    b.append(bb, ss);
    if (c === 1) {
      // The $1 card says what covering the fee adds ("+34¢"): the fee is a third of a $1 payment.
      oneFee = h('span', 'rvc-opt-fee');
      b.append(oneFee);
    }
    if (badge) b.append(h('span', 'rvc-opt-badge', badge));
    b.addEventListener('click', () => {
      if (busy) return;
      choice = c;
      if (c === 'custom') {
        customOk = true;
        customInput.value = String(customCats);
      }
      renderBuild();
      if (c === 'custom') customInput.focus({ preventScroll: true });
    });
    optButtons.set(c, b);
    optsRow.append(b);
  };
  for (const n of fixedOptions) addOpt(n, `$${n}`, catsLabel(n), n === 5 ? 'crowd fave' : undefined);
  if (customAllowed) addOpt('custom', `$${rules.customMin}+`, 'your call');

  // -- custom stepper
  const custom = h('div', 'rvc-custom');
  const minus = h('button', 'rvc-step-btn', '−');
  minus.type = 'button';
  minus.setAttribute('aria-label', 'One cat fewer');
  const plus = h('button', 'rvc-step-btn', '+');
  plus.type = 'button';
  plus.setAttribute('aria-label', 'One cat more');
  const customWrap = h('label', 'rvc-custom-field');
  const dollar = h('span', 'rvc-dollar', '$');
  dollar.setAttribute('aria-hidden', 'true');
  const customInput = h('input', 'rvc-custom-input');
  customInput.type = 'text';
  customInput.inputMode = 'numeric';
  customInput.autocomplete = 'off';
  customInput.setAttribute('aria-label', `Custom amount in whole dollars, ${rules.customMin} to ${rules.max}`);
  customInput.value = String(customCats);
  customWrap.append(dollar, customInput);
  custom.append(minus, customWrap, plus);
  const quick = h('div', 'rvc-quick');
  for (const n of QUICK_CUSTOM.filter((q) => q >= rules.customMin && q <= rules.max)) {
    const b = h('button', 'rvc-quick-btn', `$${n}`);
    b.type = 'button';
    b.addEventListener('click', () => {
      customCats = n;
      customOk = true;
      customInput.value = String(n);
      renderBuild();
    });
    quick.append(b);
  }
  const customMsg = h('div', 'rvc-field-msg');
  customMsg.id = `${id}-custom-msg`;
  customInput.setAttribute('aria-describedby', customMsg.id);
  const customBox = h('div', 'rvc-custom-box');
  customBox.append(custom, quick, customMsg);
  const bump = (d: number) => {
    const base = customOk ? customCats : rules.customMin;
    customCats = Math.min(rules.max, Math.max(rules.customMin, base + d));
    customOk = true;
    customInput.value = String(customCats);
    renderBuild();
  };
  minus.addEventListener('click', () => bump(-1));
  plus.addEventListener('click', () => bump(1));
  customInput.addEventListener('input', () => {
    const r = parseCustom(customInput.value, rules);
    customOk = r.ok;
    if (r.ok) customCats = r.cats;
    customMsg.textContent = r.ok ? '' : r.message;
    renderBuild(false);
  });
  customInput.addEventListener('blur', () => {
    if (customOk) customInput.value = String(customCats);
  });

  // -- live preview
  const preview = h('div', 'rvc-preview');
  preview.setAttribute('aria-live', 'polite');
  const previewLine = h('div', 'rvc-preview-line rv-display');
  const previewCats = h('div', 'rvc-preview-cats');
  previewCats.setAttribute('aria-hidden', 'true');
  preview.append(previewLine, previewCats);
  let lastPreview = -1;

  // -- names
  const namesSet = h('fieldset', 'rvc-names');
  const namesLegend = h('legend', 'rvc-legend', 'Name your cats');
  namesLegend.append(h('span', 'rvc-opt-tag', 'optional'));
  // The grey text is an example, never a promise: an empty field gets the server's surprise name.
  const namesHint = h('p', 'rvc-hint', `Up to ${CAT_NAME_MAX_LENGTH} characters. Leave a field empty and we’ll pick a surprise name.`);
  const namesGrid = h('div', 'rvc-names-grid');
  const nameInputs: HTMLInputElement[] = [];
  const nameMsgs: HTMLDivElement[] = [];
  const nameCells: HTMLDivElement[] = [];
  const nameSyncs: Array<() => void> = [];
  const mkNameInput = (key: string, label: string, ph: string) => {
    const cell = h('div', 'rvc-name');
    const input = h('input', 'rvc-input');
    input.type = 'text';
    input.maxLength = CAT_NAME_MAX_LENGTH;
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('autocapitalize', 'words');
    input.placeholder = ph;
    input.setAttribute('aria-label', label);
    input.dataset.key = key;
    const msg = h('div', 'rvc-field-msg');
    msg.id = `${id}-name-${key}`;
    // Live length counter (e.g. 14/16): the input stops at the limit, so the buyer sees why.
    const count = h('span', 'rvc-count');
    count.id = `${id}-name-${key}-count`;
    count.setAttribute('aria-hidden', 'true');
    // A pasted name longer than the limit is cut by maxLength: say so ("trimmed to 16") until the next edit.
    let trimmedNote = false;
    const syncCount = () => {
      const len = input.value.length;
      count.textContent = len ? (trimmedNote ? `trimmed to ${CAT_NAME_MAX_LENGTH}` : `${len}/${CAT_NAME_MAX_LENGTH}`) : '';
      count.classList.toggle('rvc-count-max', len >= CAT_NAME_MAX_LENGTH);
    };
    input.setAttribute('aria-describedby', msg.id);
    input.addEventListener('paste', (e) => {
      const text = e.clipboardData?.getData('text') ?? '';
      const selected = (input.selectionEnd ?? input.value.length) - (input.selectionStart ?? input.value.length);
      trimmedNote = input.value.length - selected + text.trim().length > CAT_NAME_MAX_LENGTH;
    });
    input.addEventListener('input', (e) => {
      if ((e as InputEvent).inputType !== 'insertFromPaste') trimmedNote = false;
      syncCount();
      renderNames();
    });
    input.addEventListener('blur', () => {
      // No silent trailing space after a cut at the limit.
      const trimmed = input.value.trim();
      if (trimmed !== input.value) input.value = trimmed;
      syncCount();
      touched.add(key);
      renderNames();
    });
    const field = h('div', 'rvc-name-field');
    field.append(input, count);
    cell.append(field, msg);
    return { cell, input, msg, syncCount };
  };
  for (let i = 0; i < 10; i += 1) {
    const r = mkNameInput(String(i), `Name of cat ${i + 1}`, i === 0 ? NAME_EXAMPLE : SURPRISE_PLACEHOLDER);
    nameInputs.push(r.input);
    nameSyncs.push(r.syncCount);
    nameMsgs.push(r.msg);
    nameCells.push(r.cell);
    namesGrid.append(r.cell);
  }
  const rest = mkNameInput('rest', 'Name for the rest of the cats', SURPRISE_PLACEHOLDER);
  nameSyncs.push(rest.syncCount);
  rest.cell.classList.add('rvc-name-rest');
  const restLabel = h('div', 'rvc-rest-label');
  rest.cell.prepend(restLabel);
  namesSet.append(namesLegend, namesHint, namesGrid, rest.cell);

  // -- X handle
  const xBox = h('div', 'rvc-xbox');
  const xLabel = h('label', 'rvc-legend', 'Your X account');
  xLabel.append(h('span', 'rvc-opt-tag', 'optional'));
  const xField = h('div', 'rvc-xfield');
  const xIcon = h('span', 'rvc-x-ico', '𝕏');
  xIcon.setAttribute('aria-hidden', 'true');
  const xInput = h('input', 'rvc-input rvc-x-input');
  xInput.type = 'text';
  xInput.id = `${id}-x`;
  xLabel.htmlFor = xInput.id;
  xInput.placeholder = '@yourhandle or x.com/you';
  xInput.autocomplete = 'off';
  xInput.spellcheck = false;
  xInput.maxLength = 100;
  xInput.setAttribute('autocapitalize', 'off');
  xInput.setAttribute('inputmode', 'text');
  xField.append(xIcon, xInput);
  const xHelp = h('div', 'rvc-hint rvc-x-help', 'Shown publicly with your cats.');
  xHelp.id = `${id}-x-help`;
  const xMsg = h('div', 'rvc-field-msg');
  xMsg.id = `${id}-x-msg`;
  xInput.setAttribute('aria-describedby', `${xHelp.id} ${xMsg.id}`);
  xBox.append(xLabel, xField, xHelp, xMsg);
  xInput.addEventListener('input', () => renderX());
  xInput.addEventListener('blur', () => {
    touched.add('x');
    renderX();
  });

  // -- country (the flag the cats hold): hidden when the server knows it from the IP
  const countryPicker = createCountryPicker({
    id,
    detected: opts.country !== undefined ? opts.country : status.country,
    storage: opts.storage,
    languages: typeof navigator !== 'undefined' ? navigator.languages : [],
  });

  // -- method tabs
  const tabs = h('div', 'rvc-tabs');
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Pay with');
  const tabCard = h('button', 'rvc-tab', '💳 Card · Apple Pay · Google Pay');
  const tabUsdc = h('button', 'rvc-tab', '🪙 USDC');
  for (const [t, m] of [[tabCard, 'card'], [tabUsdc, 'usdc']] as const) {
    t.type = 'button';
    t.setAttribute('role', 'tab');
    t.addEventListener('click', () => {
      if (busy || method === m) return;
      method = m;
      renderBuild();
      if (m === 'usdc') void prepareUsdc();
    });
  }
  if (cardEnabled) tabs.append(tabCard);
  if (usdcEnabled) tabs.append(tabUsdc);
  tabs.hidden = !(cardEnabled && usdcEnabled);

  // -- card panel
  const cardPanel = h('div', 'rvc-panel');
  const feeLabel = h('label', 'rvc-fee');
  const feeBox = h('input', 'rvc-fee-input');
  feeBox.type = 'checkbox';
  feeBox.checked = true;
  const feeSwitch = h('span', 'rvc-switch');
  feeSwitch.setAttribute('aria-hidden', 'true');
  const feeText = h('span', 'rvc-fee-text');
  const feeMain = h('b');
  const feeSub = h('small');
  feeText.append(feeMain, feeSub);
  feeLabel.append(feeBox, feeSwitch, feeText);
  feeBox.addEventListener('change', () => {
    coverFee = feeBox.checked;
    renderBuild(false);
  });
  // Stripe's fixed ~30¢ is a big share of a $1 cat: say so (and nudge towards $5).
  const feeNote = h('p', 'rvc-hint rvc-fee-note');
  const total = h('div', 'rvc-total');
  const totalLbl = h('span', '', 'Total');
  const totalVal = h('b', 'rv-display');
  total.append(totalLbl, totalVal);
  cardPanel.append(feeLabel, feeNote);

  // -- usdc panel
  const usdcPanel = h('div', 'rvc-panel');
  const usdcChains = h('div', 'rvc-chains');
  usdcChains.setAttribute('role', 'radiogroup');
  usdcChains.setAttribute('aria-label', 'Chain');
  const usdcNote = h('p', 'rvc-hint', 'Straight from your wallet into Pink Paw’s ShelterSplit, tagged with your order. You pay the gas.');
  usdcPanel.append(usdcChains, usdcNote);

  const buildMsg = h('div', 'rv-msg rvc-msg');
  buildMsg.setAttribute('aria-live', 'polite');
  const go = h('button', 'rvc-go');
  go.type = 'button';
  const legal = h('p', 'rvc-legal');
  // Sticky footer: the total and Continue stay on screen while the buyer scrolls the names.
  const foot = h('div', 'rvc-foot');
  foot.append(buildMsg, total, go);
  build.append(landed, optsRow, customBox, preview, namesSet, xBox, countryPicker.el, tabs, cardPanel, usdcPanel, foot, legal);

  // ================================================================== step: pay (card)
  const pay = h('section', 'rvc-step rvc-pay');
  const paySummary = h('div', 'rvc-summary');
  const payBack = h('button', 'rvc-link-btn', '← Edit');
  payBack.type = 'button';
  const payEl = h('div', 'rvc-pe');
  const paySkel = h('div', 'rvc-skel');
  paySkel.append(h('i'), h('i'), h('i'));
  const payMsg = h('div', 'rv-msg rvc-msg');
  payMsg.setAttribute('aria-live', 'polite');
  const payGo = h('button', 'rvc-go');
  payGo.type = 'button';
  const payLegal = h('p', 'rvc-legal');
  pay.append(payBack, paySummary, paySkel, payEl, payMsg, payGo, payLegal);

  // ================================================================== step: wallet (usdc progress)
  const wallet = h('section', 'rvc-step rvc-wallet');
  const walletOrb = h('div', 'rvc-orb');
  walletOrb.setAttribute('aria-hidden', 'true');
  const walletLine = h('p', 'rvc-wallet-line');
  walletLine.setAttribute('aria-live', 'polite');
  const walletBack = h('button', 'rvc-link-btn', '← Back');
  walletBack.type = 'button';
  wallet.append(walletOrb, walletLine, walletBack);

  // ================================================================== step: done
  const done = h('section', 'rvc-step rvc-done');
  const doneTitle = h('h3', 'rv-display rvc-done-title');
  doneTitle.tabIndex = -1;
  const holo = h('div', 'rvc-holo');
  const doneWho = h('p', 'rvc-done-who');
  const doneStatus = h('p', 'rvc-done-status');
  doneStatus.setAttribute('aria-live', 'polite');
  const doneOrder = h('p', 'rvc-done-order');
  const doneBtns = h('div', 'rvc-done-btns');
  const watch = h('button', 'rvc-go', 'Watch them land 🪩');
  watch.type = 'button';
  const again = h('button', 'rvc-link-btn', 'Add more cats');
  again.type = 'button';
  doneBtns.append(watch, again);
  done.append(doneTitle, holo, doneWho, doneStatus, doneOrder, doneBtns);

  root.append(build, pay, wallet, done);
  container.append(root);

  // ------------------------------------------------------------------ renderers
  function setStep(s: Step) {
    step = s;
    root.dataset.step = s;
    build.hidden = s !== 'build';
    pay.hidden = s !== 'pay';
    wallet.hidden = s !== 'wallet';
    done.hidden = s !== 'done';
    lede.hidden = s === 'done';
    testBanner.hidden = status.livemode || s === 'done';
  }

  function renderPreview() {
    const n = catsOk() ? cats() : 0;
    previewLine.textContent = n ? `${catsLabel(n)} will join the floor` : 'Pick how many cats';
    if (n === lastPreview) return;
    lastPreview = n;
    const glyphs: HTMLElement[] = [];
    for (let i = 0; i < Math.min(n, PREVIEW_MAX); i += 1) {
      const g = h('span', 'rvc-pc', '🐈');
      g.style.animationDelay = `${(i * 0.035).toFixed(3)}s`;
      glyphs.push(g);
    }
    if (n > PREVIEW_MAX) glyphs.push(h('span', 'rvc-pc-more', `+${(n - PREVIEW_MAX).toLocaleString('en-US')}`));
    previewCats.replaceChildren(...glyphs);
    preview.classList.remove('rvc-pop');
    void preview.offsetWidth;
    preview.classList.add('rvc-pop');
  }

  function renderNames(showAll = false) {
    const n = catsOk() ? cats() : choice === 'custom' ? rules.customMin : 1;
    const { named, rest: hasRest } = nameFieldCount(n);
    nameCells.forEach((c, i) => (c.hidden = i >= named));
    namesGrid.dataset.count = String(named);
    rest.cell.hidden = !hasRest;
    if (hasRest) {
      const restVal = rest.input.value.trim();
      restLabel.textContent = restVal
        ? `Cats 11 to ${n.toLocaleString('en-US')} get one name, numbered: “${restVal} 11”, “${restVal} 12”…`
        : `Cats 11 to ${n.toLocaleString('en-US')} get one name, numbered (“… 11”, “… 12”). Empty: we’ll pick a surprise name.`;
    }
    namesLegend.firstChild!.textContent = n === 1 ? 'Name your cat' : 'Name your cats';
    const check = checkNames(nameInputs.map((i) => i.value), rest.input.value, n);
    nameMsgs.forEach((m) => (m.textContent = ''));
    rest.msg.textContent = '';
    nameInputs.forEach((i) => i.removeAttribute('aria-invalid'));
    rest.input.removeAttribute('aria-invalid');
    for (const e of check.errors) {
      const key = String(e.index);
      if (!showAll && !touched.has(key)) continue;
      const input = e.index === 'rest' ? rest.input : nameInputs[e.index];
      const msg = e.index === 'rest' ? rest.msg : nameMsgs[e.index];
      msg.textContent = e.message;
      input.setAttribute('aria-invalid', 'true');
    }
    return check;
  }

  function renderX(showAll = false) {
    const r = normalizeXHandle(xInput.value);
    xMsg.replaceChildren();
    xInput.removeAttribute('aria-invalid');
    xMsg.className = 'rvc-field-msg';
    if (!r.ok) {
      if (showAll || touched.has('x')) {
        xMsg.textContent = r.message;
        xInput.setAttribute('aria-invalid', 'true');
      }
    } else if (r.handle) {
      const a = xLink(r.handle);
      if (a) {
        xMsg.className = 'rvc-field-msg rvc-ok';
        xMsg.append(document.createTextNode('Your cats will link to '), a);
      }
    }
    return r;
  }

  function renderUsdcChains() {
    usdcChains.replaceChildren();
    if (usdcLoading || !usdcList) {
      usdcChains.append(h('span', 'rvc-hint', usdcLoading ? 'Loading chains…' : ''));
      return;
    }
    if (!usdcList.length) {
      usdcChains.append(h('span', 'rvc-hint', 'No chain is open for USDC gifts right now. Pay by card instead.'));
      return;
    }
    for (const c of usdcList) {
      const b = h('button', 'rvc-chain', c.name);
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(usdcPick?.chainId === c.chainId));
      b.addEventListener('click', () => {
        if (busy) return;
        usdcPick = c;
        renderBuild(false);
      });
      usdcChains.append(b);
    }
  }

  function renderBuild(resetMsg = true) {
    if (resetMsg) setMsg(buildMsg, '');
    for (const [c, b] of optButtons) {
      const on = c === choice;
      b.setAttribute('aria-checked', String(on));
      b.classList.toggle('rvc-on', on);
      b.disabled = busy;
    }
    customBox.hidden = choice !== 'custom';
    minus.disabled = busy || (customOk && customCats <= rules.customMin);
    plus.disabled = busy || (customOk && customCats >= rules.max);
    if (choice === 'custom' && customOk) customMsg.textContent = '';
    renderPreview();
    renderNames();
    const n = cats();
    tabCard.setAttribute('aria-selected', String(method === 'card'));
    tabUsdc.setAttribute('aria-selected', String(method === 'usdc'));
    cardPanel.hidden = method !== 'card';
    usdcPanel.hidden = method !== 'usdc';
    const q = quote(catsOk() ? n : 0, coverFee, status.fee, method);
    const feeIfCovered = quote(catsOk() ? n : 0, true, status.fee, 'card').feeCents;
    feeMain.textContent = `Cover the card fee (+${feeCentsText(feeIfCovered)})`;
    if (oneFee) {
      const oneFeeCents = quote(1, true, status.fee, 'card').feeCents;
      oneFee.textContent = `+${feeCentsText(oneFeeCents)} card fee`;
      oneFee.hidden = !(method === 'card' && coverFee && oneFeeCents > 0);
    }
    feeSub.textContent = catsOk() ? `So Pink Paw gets the full ${formatCents(n * 100)}.` : 'So Pink Paw gets the full amount.';
    const feeShare = catsOk() && n > 0 ? feeIfCovered / (n * 100) : 0;
    feeNote.textContent =
      feeShare >= 0.15
        ? `Stripe’s minimum fee is ~${status.fee.fixedCents}¢ per payment${fixedOptions.includes(5) && n < 5 ? ', so the $5 option wastes less' : ''}.`
        : '';
    feeNote.hidden = !feeNote.textContent;
    total.hidden = method !== 'card';
    totalVal.textContent = catsOk() ? formatCents(q.amountCents) : '–';
    if (method === 'card') {
      go.textContent = busy ? 'Getting the floor ready…' : catsOk() ? `Continue · ${formatCents(q.amountCents)}` : 'Continue';
      legal.textContent = catsOk()
        ? `Token Tails pays the full ${formatCents(n * 100)} to Pink Paw on-chain within minutes. Card payments are not tax-deductible donations.`
        : 'Card payments are not tax-deductible donations.';
    } else {
      renderUsdcChains();
      go.textContent = busy ? 'Opening your wallet…' : catsOk() ? `Give ${n.toLocaleString('en-US')} USDC${usdcPick ? ` on ${usdcPick.name}` : ''}` : 'Give USDC';
      legal.textContent = 'The gift goes on-chain to Pink Paw from your own wallet. Gifts are not tax-deductible donations.';
    }
    go.disabled = busy || !catsOk() || (method === 'usdc' && !usdcPick);
    go.classList.toggle('rvc-busy', busy);
  }

  function setMsg(el: HTMLElement, text: string, tone: 'err' | 'ok' | '' = '') {
    el.className = `rv-msg rvc-msg${tone ? ` rv-${tone}` : ''}`;
    el.textContent = text;
  }

  // ------------------------------------------------------------------ submit
  function collect(): CheckoutRequest | null {
    if (!catsOk()) {
      if (choice === 'custom') {
        const r = parseCustom(customInput.value, rules);
        customMsg.textContent = r.ok ? '' : r.message;
        customInput.focus();
      }
      return null;
    }
    const n = cats();
    const names = renderNames(true);
    const x = renderX(true);
    if (!names.ok) {
      const first = names.errors[0];
      (first.index === 'rest' ? rest.input : nameInputs[first.index]).focus();
      setMsg(buildMsg, 'One of the names needs a change.', 'err');
      return null;
    }
    if (!x.ok) {
      xInput.focus();
      setMsg(buildMsg, 'Check your X account, or leave it empty.', 'err');
      return null;
    }
    const body = {
      cats: n,
      method,
      coverFee: method === 'card' ? coverFee : false,
      names: names.names,
      restName: names.restName,
      x: x.handle ?? '',
      ...(countryPicker.value() ? { country: countryPicker.value()! } : {}),
    };
    // Same body → same clientKey → the server returns the same order (double tap, retry).
    const key = JSON.stringify(body);
    if (key !== lastBody) {
      clientKey = newClientKey();
      lastBody = key;
    }
    return { ...body, clientKey };
  }

  function applyServerError(err: unknown, msgEl: HTMLElement) {
    if (!(err instanceof RaveApiError)) {
      setMsg(msgEl, 'Something went wrong. Try again.', 'err');
      return;
    }
    if (err.code === 'RAVE_KEY_REUSED') {
      lastBody = '';
      clientKey = newClientKey();
    }
    if (err.code === 'RAVE_NAME' && err.fields.length) {
      for (const f of err.fields) {
        const input = f.index === 'rest' ? rest.input : nameInputs[f.index];
        const msg = f.index === 'rest' ? rest.msg : nameMsgs[f.index];
        if (!input || !msg) continue;
        msg.textContent = nameMessage(f.code);
        input.setAttribute('aria-invalid', 'true');
      }
    }
    if (err.code === 'RAVE_X_HANDLE' || err.code.startsWith('X_HANDLE_')) {
      const sub = err.fieldCode ?? err.fields.find((f) => f.code.startsWith('X_HANDLE_'))?.code ?? err.code;
      xMsg.className = 'rvc-field-msg';
      xMsg.textContent = sub === 'X_HANDLE_BLOCKED' ? X_HANDLE_MESSAGES.X_HANDLE_BLOCKED : X_HANDLE_MESSAGES.X_HANDLE_INVALID;
      xInput.setAttribute('aria-invalid', 'true');
    }
    setMsg(msgEl, err.message, 'err');
  }

  async function submit() {
    if (busy || destroyed) return;
    const body = collect();
    if (!body) return;
    if (body.method === 'usdc') return submitUsdc(body);
    busy = true;
    renderBuild();
    try {
      const a = await api.checkout(body);
      if (destroyed) return;
      if (!a.clientSecret || a.cats !== body.cats) throw new RaveApiError(502, 'BAD_ANSWER', 'Something went wrong on our side. Try again.');
      answer = a;
      busy = false;
      await openPay(a);
    } catch (err) {
      if (destroyed) return;
      busy = false;
      renderBuild(false);
      applyServerError(err, buildMsg);
    }
  }

  function summaryFor(a: CheckoutAnswer) {
    const names = expandNames(a.names, a.restName, a.cats, 3);
    const line = h('div', 'rvc-sum-line');
    line.append(h('b', 'rv-display', catsLabel(a.cats)), document.createTextNode(` · ${namesSummary(names, a.cats)}`));
    const link = xLink(a.x);
    if (link) line.append(document.createTextNode(' · '), link);
    const money = h('div', 'rvc-sum-money');
    money.textContent = a.feeCents
      ? `${formatCents(a.donationCents)} to Pink Paw + ${formatCents(a.feeCents)} card fee = ${formatCents(a.amountCents)}`
      : `${formatCents(a.amountCents)} to Pink Paw`;
    return [line, money];
  }

  async function openPay(a: CheckoutAnswer) {
    setStep('pay');
    paySummary.replaceChildren(...summaryFor(a));
    payLegal.textContent = `Payments by Stripe. Token Tails pays the full ${formatCents(a.donationCents)} to Pink Paw on-chain within minutes. Card payments are not tax-deductible donations.`;
    setMsg(payMsg, '');
    paySkel.hidden = false;
    payEl.replaceChildren();
    payGo.disabled = true;
    payGo.textContent = `Pay ${formatCents(a.amountCents)}`;
    payment?.destroy();
    payment = null;
    try {
      const mounted = await mountPaymentElement(payEl, {
        publishableKey: status.publishableKey,
        clientSecret: a.clientSecret!,
        onReady: () => {
          paySkel.hidden = true;
        },
        onComplete: (complete) => {
          if (!busy) payGo.disabled = !complete;
        },
        onLoadError: (m) => {
          paySkel.hidden = true;
          setMsg(payMsg, m, 'err');
        },
      });
      if (destroyed || step !== 'pay' || answer !== a) {
        mounted.destroy();
        return;
      }
      payment = mounted;
    } catch (err) {
      if (destroyed) return;
      paySkel.hidden = true;
      setMsg(payMsg, (err as Error).message || 'Card payments could not load.', 'err');
    }
  }

  async function confirmCard() {
    const a = answer;
    if (busy || !payment || !a) return;
    busy = true;
    payGo.disabled = true;
    payBack.disabled = true;
    payGo.classList.add('rvc-busy');
    payGo.textContent = 'Paying… your bank may ask to confirm';
    setMsg(payMsg, '');
    let r: ConfirmOutcome;
    try {
      r = await payment.confirm();
    } catch {
      r = { ok: false, message: 'Something went wrong while paying. Try again (a payment is only ever taken once).', retry: true };
    } finally {
      // Always cleared, whatever happened (the sheen must never keep running after an error).
      payGo.classList.remove('rvc-busy');
    }
    if (destroyed) return;
    busy = false;
    payBack.disabled = false;
    payGo.textContent = `Pay ${formatCents(a.amountCents)}`;
    if (!r.ok) {
      payGo.disabled = false;
      // A decline gets a next step (another card, a wallet, or USDC) and focus goes back to the form.
      if (r.declined && usdcEnabled) {
        // "switch to USDC" is a real way out: back to the build step with the USDC tab selected.
        setMsg(payMsg, `${r.message} ${declineNextStep(false).replace(/\.$/, '')}, or `, 'err');
        const toUsdc = h('button', 'rvc-link-btn rvc-inline-link', 'switch to USDC');
        toUsdc.type = 'button';
        toUsdc.addEventListener('click', () => {
          if (busy) return;
          payment?.destroy();
          payment = null;
          method = 'usdc';
          setStep('build');
          renderBuild();
          void prepareUsdc();
          requestAnimationFrame(() => tabUsdc.focus({ preventScroll: false }));
        });
        payMsg.append(toUsdc, document.createTextNode('.'));
      } else setMsg(payMsg, r.declined ? `${r.message} ${declineNextStep(false)}` : r.message, 'err');
      if (r.declined) payment?.focus();
      return;
    }
    succeed(a, r.status === 'succeeded' ? 'paid' : 'pending', null, null, 'card');
  }

  // ------------------------------------------------------------------ usdc
  async function prepareUsdc() {
    if (usdcList || usdcLoading) return;
    usdcLoading = true;
    renderBuild(false);
    try {
      const [sdk, deployments] = await Promise.all([loadSdk(), loadDeployments()]);
      usdcList = usdcChoices(status.usdc.chains, deployments, sdk.CHAINS);
      usdcPick = usdcList[0] ?? null;
    } catch {
      usdcList = [];
    } finally {
      usdcLoading = false;
      if (!destroyed && step === 'build') renderBuild(false);
    }
  }

  async function submitUsdc(body: CheckoutRequest) {
    const pick = usdcPick;
    if (!pick) return;
    const provider = injectedProvider();
    if (!provider) {
      setMsg(buildMsg, 'No wallet found in this browser. Open this page in your wallet app’s browser, or pay by card.', 'err');
      return;
    }
    busy = true;
    renderBuild();
    let a: CheckoutAnswer;
    try {
      a = await api.checkout(body);
      if (destroyed) return;
      const units = a.usdc?.amountUnits6 ?? '0';
      const okChain = !a.usdc?.chains.length || a.usdc.chains.includes(pick.chainId);
      if (!a.memo || a.cats !== body.cats || BigInt(units) !== BigInt(body.cats) * 1_000_000n || !okChain) {
        throw new RaveApiError(502, 'BAD_ANSWER', 'Something went wrong on our side. Nothing was sent.');
      }
    } catch (err) {
      if (destroyed) return;
      busy = false;
      renderBuild(false);
      applyServerError(err, buildMsg);
      return;
    }
    answer = a;
    setStep('wallet');
    walletLine.textContent = `Confirm in your wallet: ${a.cats.toLocaleString('en-US')} USDC to Pink Paw on ${pick.name}.${pick.native ? '' : ' It may ask twice (approve, then give).'}`;
    walletBack.hidden = true;
    let txHash: string;
    try {
      const sdk = await loadSdk();
      const r = await giveUsdc({ sdk, provider, choice: pick, memo: a.memo!, amountUnits6: a.usdc!.amountUnits6 });
      txHash = r.txHash;
    } catch (err) {
      if (destroyed) return;
      busy = false;
      walletLine.textContent = walletMessage(err);
      walletBack.hidden = false;
      return;
    }
    if (destroyed) return;
    busy = false;
    addMyOrder(a.orderId);
    pendingUsdcReport = { chainId: pick.chainId, txHash };
    await reportUsdc(a.orderId);
    succeed(a, 'pending', txHash, pick.chainId, 'usdc');
  }

  /** Tells the server the tx (retried by the done-screen poll until it sticks). */
  async function reportUsdc(orderId: string): Promise<RaveOrderRow | null> {
    const p = pendingUsdcReport;
    if (!p) return null;
    try {
      const row = await api.usdcTx(orderId, p.chainId, p.txHash);
      pendingUsdcReport = null;
      return row;
    } catch (err) {
      if (err instanceof RaveApiError && err.code === 'RAVE_TX_MISMATCH') {
        pendingUsdcReport = null;
        if (!destroyed) setMsg(doneStatus, err.message, 'err');
      }
      return null;
    }
  }

  // ------------------------------------------------------------------ success
  function succeed(a: CheckoutAnswer, st: 'paid' | 'pending', txHash: string | null, chainId: number | null, m: RaveMethod) {
    if (m === 'card') addMyOrder(a.orderId);
    payment?.destroy();
    payment = null;
    const all = expandNames(a.names, a.restName, a.cats, 1000);
    const paid: PaidOrder = { orderId: a.orderId, cats: a.cats, names: all, x: a.x ?? null, method: m, status: st, txHash, chainId, answer: a };
    setStep('done');
    lastDone = { names: all, cats: a.cats, status: st };
    doneTitle.textContent = `Your ${a.cats === 1 ? 'cat is' : `${a.cats.toLocaleString('en-US')} cats are`} arriving 🛸`;
    const holos: HTMLElement[] = [];
    all.slice(0, HOLO_MAX).forEach((name, i) => {
      const cell = h('span', 'rvc-holo-cat');
      cell.style.animationDelay = `${(i * 0.08).toFixed(2)}s`;
      const g = h('span', 'rvc-holo-g', '🐈');
      g.setAttribute('aria-hidden', 'true');
      cell.append(g, h('span', 'rvc-holo-n', name));
      holos.push(cell);
    });
    if (a.cats > HOLO_MAX) holos.push(h('span', 'rvc-holo-more', `+${(a.cats - HOLO_MAX).toLocaleString('en-US')} more`));
    holo.replaceChildren(...holos);
    doneWho.replaceChildren();
    const link = xLink(a.x);
    if (link) doneWho.append(document.createTextNode('The DJ will shout out '), link, document.createTextNode(' when they land.'));
    else doneWho.textContent = 'The DJ will shout out their names when they land.';
    doneOrder.textContent = `Order ${a.orderId}`;
    renderDoneStatus({ orderId: a.orderId, cats: a.cats, names: a.names, status: st, chainId, payoutTx: null, method: m });
    requestAnimationFrame(() => doneTitle.focus({ preventScroll: true }));
    try {
      opts.onPaid?.(paid);
    } catch {
      /* the page's animation must never break the receipt */
    }
    startPolling(a.orderId, m);
  }

  function renderDoneStatus(row: RaveOrderRow) {
    const m = row.method ?? (answer?.usdc ? 'usdc' : 'card');
    const amount = formatCents(row.cats * 100);
    doneStatus.className = 'rvc-done-status';
    doneStatus.replaceChildren();
    switch (row.status) {
      case 'pending':
        doneStatus.textContent = m === 'usdc' ? 'Checking your gift on-chain…' : 'Your bank is confirming the payment…';
        break;
      case 'paid':
        doneStatus.textContent =
          m === 'usdc'
            ? 'Gift received ✓ Your cats are on their way to the floor…'
            : `Paid ✓ Token Tails is sending ${amount} to Pink Paw on-chain…${status.payoutsDelayed ? ' (payouts are slow right now)' : ''}`;
        break;
      case 'review':
        doneStatus.textContent = 'Paid ✓ A quick safety check, then the payout goes out.';
        break;
      case 'onchain': {
        doneStatus.classList.add('rvc-ok');
        doneStatus.append(document.createTextNode(`On-chain ✓ ${amount} reached Pink Paw. `));
        const chain = row.chainId ? RAVE_CHAINS[row.chainId] : undefined;
        if (chain && row.payoutTx) {
          const a = h('a', '', 'View payout ↗');
          a.href = explorerTx(chain.explorer, row.payoutTx);
          a.target = '_blank';
          a.rel = 'noopener';
          doneStatus.append(a);
        }
        break;
      }
      case 'refunded':
      case 'disputed':
        doneStatus.textContent = 'This payment was refunded, so these cats will not arrive.';
        break;
      case 'canceled':
      case 'expired':
      case 'created':
        doneStatus.textContent = row.status === 'created' ? 'Waiting for the payment…' : 'This order was canceled. Nothing was charged.';
        break;
    }
  }

  function renderLanded() {
    if (!lastDone) {
      landed.hidden = true;
      return;
    }
    const who = namesSummary(lastDone.names, lastDone.cats);
    const on = lastDone.status === 'onchain';
    const gone = ['refunded', 'disputed', 'canceled', 'expired'].includes(lastDone.status);
    landed.hidden = gone;
    landed.classList.toggle('rvc-ok', on);
    landed.textContent = on ? `${who} landed ✓` : `${who} ${lastDone.cats === 1 ? 'is' : 'are'} arriving…`;
  }

  function startPolling(orderId: string, m: RaveMethod) {
    const started = Date.now();
    if (pollTimer) clearTimeout(pollTimer);
    pollOrderId = orderId;
    const tick = async () => {
      pollTimer = null;
      if (destroyed || pollOrderId !== orderId) return;
      let row: RaveOrderRow | null = null;
      try {
        if (pendingUsdcReport) row = await reportUsdc(orderId);
        row = row ?? (await api.order(orderId));
      } catch {
        row = null;
      }
      if (destroyed || pollOrderId !== orderId) return;
      if (row) {
        if (!row.method) row.method = m;
        renderDoneStatus(row);
        if (lastDone) {
          lastDone.status = row.status;
          renderLanded();
        }
        try {
          opts.onOrderUpdate?.(row);
        } catch {
          /* ignore */
        }
        if (['onchain', 'refunded', 'disputed', 'canceled', 'expired'].includes(row.status)) return;
      }
      const age = Date.now() - started;
      if (age > 30 * 60_000) return;
      pollTimer = setTimeout(tick, age < 2 * 60_000 ? 4_000 : 15_000);
    };
    pollTimer = setTimeout(tick, 2_500);
  }

  /** A fresh build step. The last order's poll keeps running (its cats still land) and shows as a note. */
  function reset(focus = true) {
    answer = null;
    pendingUsdcReport = null;
    lastBody = '';
    clientKey = newClientKey();
    busy = false;
    for (const i of nameInputs) i.value = '';
    rest.input.value = '';
    for (const r of nameSyncs) r();
    touched.clear();
    setStep('build');
    renderLanded();
    renderBuild();
    if (focus) requestAnimationFrame(() => title.focus({ preventScroll: true }));
  }

  // ------------------------------------------------------------------ wiring
  go.addEventListener('click', () => void submit());
  build.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.target as HTMLElement)?.tagName === 'INPUT' && (e.target as HTMLInputElement).type === 'text') {
      e.preventDefault();
      void submit();
    }
  });
  payGo.addEventListener('click', () => void confirmCard());
  payBack.addEventListener('click', () => {
    if (busy) return;
    payment?.destroy();
    payment = null;
    setStep('build');
    renderBuild();
  });
  walletBack.addEventListener('click', () => {
    if (busy) return;
    setStep('build');
    renderBuild();
  });
  watch.addEventListener('click', () => opts.onDone?.());
  again.addEventListener('click', () => reset());

  setStep('build');
  renderBuild();
  if (method === 'usdc') void prepareUsdc();

  return {
    onOpen() {
      // Reopening after a purchase starts a new one; the old order shows as a slim note.
      if (step === 'done' && !busy) reset(false);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (pollTimer) clearTimeout(pollTimer);
      payment?.destroy();
      payment = null;
      root.remove();
    },
  };
}
