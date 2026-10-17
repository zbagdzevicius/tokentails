/**
 * "Advertise here": the in-page ad purchase sheet, in the rave checkout's style.
 *
 *   pick  →  a free slot on the mini-map (moon on top, booth in the middle)
 *   form  →  image (cropped to the slot's shape), name, https link, optional X handle, Card | Crypto, fee toggle
 *   pay   →  card: Stripe Payment Element (card, Apple Pay, Google Pay), the slot held for 15 minutes
 *   wallet → crypto: one USDC transfer on Arc to the Token Tails treasury, then POST usdc-tx
 *   done  →  "In review": it goes live after approval, or the payment is refunded in full
 *
 * Never navigates away. All user text goes in with textContent; there is no innerHTML here.
 */
import '../checkout/checkout.css';
import './ads.css';
import { newClientKey } from '../checkout/api';
import { createMethodTabs, defaultMethod } from '../checkout/methods';
import { declineNextStep, mountPaymentElement, type ConfirmOutcome, type MountedPayment } from '../checkout/stripe';
import { fillNoWallet, injectedProvider, walletMessage } from '../checkout/usdc';
import { normalizeXHandle, X_HANDLE_MESSAGES } from '../checkout/xhandle';
import { AdApiError, type AdMethod, type AdOrder, type AdsApi, type AdsStatusOn } from './api';
import { formatUnits6, sendAdUsdc, shortAddress } from './usdc';
import { adQuote, checkAdName, checkImageFile, cropImageToSlot, formatCents, normalizeAdUrl } from './form';
import { AD_KINDS, AD_SEEN_IN, AD_SLOTS, adSlot, miniMapPoint, slotLabel, type AdSlot } from './slots';

export interface AdSheetOptions {
  api: AdsApi;
  status: AdsStatusOn;
  /** Paid: the slot shows as taken; the page may refresh its status. */
  onPaid?: (order: AdOrder) => void;
  onClose?: () => void;
  /** A fresh GET /rave/ads/status (the page updates its "sold" slots). */
  onStatus?: (status: AdsStatusOn) => void;
}

export interface MountedAdSheet {
  /** Opens on the pick step with `slotId` selected (when free). */
  select(slotId: string | null): void;
  /** Fresh slot availability (GET /rave/ads/status). */
  setStatus(status: AdsStatusOn): void;
  destroy(): void;
}

type Step = 'pick' | 'form' | 'pay' | 'wallet' | 'done';

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const fmtClock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

let uid = 0;

/**
 * A sent USDC ad transfer the server has not accepted yet, kept in localStorage so closing the sheet or
 * the tab never loses the link between the payment and the ad (only POST usdc-tx makes it). Re-sent on
 * the next mount. Storage may be blocked: every access is guarded.
 */
const PENDING_TX_KEY = 'rave:ad-pending-tx';
const TX_RE = /^0x[0-9a-fA-F]{64}$/;
const AD_ID_RE = /^ad_[0-9a-f]{16}$/;

export function loadPendingAdTx(): { adId: string; txHash: string } | null {
  try {
    const raw = globalThis.localStorage?.getItem(PENDING_TX_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { adId?: unknown; txHash?: unknown };
    return typeof v.adId === 'string' && AD_ID_RE.test(v.adId) && typeof v.txHash === 'string' && TX_RE.test(v.txHash) ? { adId: v.adId, txHash: v.txHash } : null;
  } catch {
    return null;
  }
}

export function savePendingAdTx(p: { adId: string; txHash: string } | null): void {
  try {
    if (p) globalThis.localStorage?.setItem(PENDING_TX_KEY, JSON.stringify(p));
    else globalThis.localStorage?.removeItem(PENDING_TX_KEY);
  } catch {
    /* storage blocked: the in-memory retry still runs while the sheet is open */
  }
}

/** A final answer (stop retrying): any 4xx except rate limits and "not mined yet". */
const finalTxError = (err: unknown) =>
  err instanceof AdApiError && err.status >= 400 && err.status < 500 && err.status !== 429 && err.code !== 'RAVE_AD_TX_PENDING';

export function mountAdSheet(container: HTMLElement, opts: AdSheetOptions): MountedAdSheet {
  const { api } = opts;
  let status = opts.status;
  const id = `rva${++uid}`;
  let step: Step = 'pick';
  let pick: AdSlot | null = null;
  let busy = false;
  let destroyed = false;
  let clientKey = newClientKey();
  let image: { blob: Blob; url: string } | null = null;
  let order: AdOrder | null = null;
  let payment: MountedPayment | null = null;
  let coverFee = true;
  let method: AdMethod = defaultMethod({ card: status.card, usdc: status.usdc.enabled });
  /** A USDC transfer sent but not yet accepted by POST usdc-tx (retried by the done-screen poll). */
  let pendingTx: { adId: string; txHash: string } | null = null;
  /** The server refused the reported transfer: shown until the buyer sends again (the poll stops). */
  let txError: string | null = null;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let holdTimer: ReturnType<typeof setInterval> | null = null;
  const touched = new Set<string>();

  const root = h('div', 'rvc rva');
  const title = h('h2', 'rv-display rvc-title', 'Advertise in the Moon Rave');
  title.id = `${id}-title`;
  title.tabIndex = -1;
  root.setAttribute('role', 'region');
  root.setAttribute('aria-labelledby', title.id);
  const lede = h('p', 'rvc-lede');
  root.append(title, lede);
  const testBanner = h('p', 'rvc-banner rvc-test', 'Test mode: use a Stripe test card or Arc testnet USDC. No real money moves.');
  root.append(testBanner);

  // ================================================================== pick
  const pickStep = h('section', 'rvc-step rva-pick');
  const map = h('div', 'rva-map');
  map.setAttribute('role', 'radiogroup');
  map.setAttribute('aria-label', 'Ad slots');
  const moon = h('div', 'rva-moon');
  moon.setAttribute('aria-hidden', 'true');
  const booth = h('div', 'rva-booth');
  booth.setAttribute('aria-hidden', 'true');
  const floor = h('div', 'rva-floor');
  floor.setAttribute('aria-hidden', 'true');
  map.append(floor, moon, booth);
  const pins = new Map<string, HTMLButtonElement>();
  for (const s of AD_SLOTS) {
    const p = miniMapPoint(s);
    const b = h('button', `rva-pin rva-k-${s.kind}`);
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.dataset.slot = s.id;
    b.style.left = `${(p.x * 100).toFixed(1)}%`;
    b.style.top = `${(p.y * 100).toFixed(1)}%`;
    b.title = `${slotLabel(s)} · ${AD_KINDS[s.kind].label}`;
    // Visible on hover, focus or press (CSS), so a slot says what it is before you pick it.
    b.dataset.label = slotLabel(s);
    b.append(h('span', 'rva-pin-label', slotLabel(s)));
    b.addEventListener('click', () => {
      if (busy) return;
      pick = s;
      renderPick();
    });
    pins.set(s.id, b);
    map.append(b);
  }
  const legend = h('div', 'rva-legend');
  for (const [k, cls] of [
    ['Free', 'rva-free'],
    ['Taken', 'rva-taken'],
    ['Yours', 'rva-sel'],
  ] as const) {
    const i = h('span', `rva-key ${cls}`);
    i.append(h('i'), document.createTextNode(k));
    legend.append(i);
  }
  // What each mark is: the same shapes as the pins, with the kind's name and count.
  const kinds = h('div', 'rva-kinds');
  kinds.setAttribute('aria-hidden', 'true');
  for (const k of Object.keys(AD_KINDS) as (keyof typeof AD_KINDS)[]) {
    const item = h('span', 'rva-kind');
    item.append(h('i', `rva-kind-mark rva-k-${k}`), document.createTextNode(`${AD_KINDS[k].short} ×${AD_KINDS[k].count}`));
    item.title = AD_SEEN_IN[k];
    kinds.append(item);
  }
  const pickInfo = h('div', 'rva-pick-info');
  pickInfo.setAttribute('aria-live', 'polite');
  const pickGo = h('button', 'rvc-go');
  pickGo.type = 'button';
  pickStep.append(map, kinds, legend, pickInfo, pickGo);

  // ================================================================== form
  const formStep = h('section', 'rvc-step rva-form');
  const back1 = h('button', 'rvc-link-btn', '← Pick another slot');
  back1.type = 'button';
  const slotLine = h('p', 'rva-slot-line');
  // -- image
  const imgBox = h('div', 'rva-imgbox');
  const imgLabel = h('label', 'rvc-legend', 'Your image');
  const fileInput = h('input', 'rva-file');
  fileInput.type = 'file';
  fileInput.accept = 'image/png,image/jpeg,image/webp';
  fileInput.id = `${id}-file`;
  imgLabel.htmlFor = fileInput.id;
  const drop = h('label', 'rva-drop');
  drop.htmlFor = fileInput.id;
  const preview = h('img', 'rva-preview');
  preview.alt = 'Your ad, cropped to the slot';
  preview.hidden = true;
  const dropText = h('span', 'rva-drop-text');
  drop.append(preview, dropText);
  const imgHint = h('div', 'rvc-hint');
  const imgMsg = h('div', 'rvc-field-msg');
  imgBox.append(imgLabel, fileInput, drop, imgHint, imgMsg);
  // -- text fields
  const field = (label: string, placeholder: string, max: number, optional = false) => {
    const box = h('div', 'rva-field');
    const l = h('label', 'rvc-legend', label);
    if (optional) l.append(h('span', 'rvc-opt-tag', 'optional'));
    const input = h('input', 'rvc-input');
    input.type = 'text';
    input.id = `${id}-${label.replace(/\W+/g, '-').toLowerCase()}`;
    l.htmlFor = input.id;
    input.placeholder = placeholder;
    input.maxLength = max;
    input.autocomplete = 'off';
    input.spellcheck = false;
    const msg = h('div', 'rvc-field-msg');
    msg.id = `${input.id}-msg`;
    input.setAttribute('aria-describedby', msg.id);
    box.append(l, input, msg);
    return { box, input, msg };
  };
  const nameF = field('Sponsor name', 'Your brand', 40);
  const urlF = field('Link', 'https://your-site.com', 300);
  urlF.input.inputMode = 'url';
  urlF.input.setAttribute('autocapitalize', 'off');
  const xF = field('Your X account', '@yourhandle or x.com/you', 100, true);
  xF.input.setAttribute('autocapitalize', 'off');
  const xHelp = h('div', 'rvc-hint', 'Shown publicly with your ad.');
  xF.box.insertBefore(xHelp, xF.msg);
  // -- Card | Crypto (USDC on Arc)
  const methodTabs = createMethodTabs({ card: status.card, usdc: status.usdc.enabled, reasons: status.reasons }, (m) => {
    if (busy || method === m) return;
    method = m;
    renderForm();
  });
  const usdcNote = h('p', 'rvc-hint');
  // -- fee + total
  const feeLabel = h('label', 'rvc-fee');
  const feeBox = h('input', 'rvc-fee-input');
  feeBox.type = 'checkbox';
  feeBox.checked = true;
  const feeSwitch = h('span', 'rvc-switch');
  feeSwitch.setAttribute('aria-hidden', 'true');
  const feeText = h('span', 'rvc-fee-text');
  const feeMain = h('b');
  // Ads are not a donation (shelterBps is 0 by default): say so on a charity page. renderForm() adds the
  // shelter share when the server reports one.
  const feeSub = h('small', '', 'Stripe’s card fee on top, so the full $100 funds the rave. Ad money is not part of the Pink Paw donation.');
  feeText.append(feeMain, feeSub);
  feeLabel.append(feeBox, feeSwitch, feeText);
  const total = h('div', 'rvc-total');
  const totalVal = h('b', 'rv-display');
  total.append(h('span', '', 'Total'), totalVal);
  const formMsg = h('div', 'rv-msg rvc-msg');
  formMsg.setAttribute('aria-live', 'polite');
  const formGo = h('button', 'rvc-go');
  formGo.type = 'button';
  const formLegal = h('p', 'rvc-legal');
  // Sticky footer: total and the button stay on screen while the buyer scrolls the form.
  const formFoot = h('div', 'rvc-foot');
  formFoot.append(formMsg, total, formGo);
  formStep.append(back1, slotLine, imgBox, nameF.box, urlF.box, xF.box, methodTabs.el, methodTabs.note, feeLabel, usdcNote, formFoot, formLegal);

  // ================================================================== pay
  const payStep = h('section', 'rvc-step rva-pay');
  const payBack = h('button', 'rvc-link-btn', '← Edit');
  payBack.type = 'button';
  const paySummary = h('div', 'rvc-summary');
  const hold = h('p', 'rva-hold');
  hold.setAttribute('aria-live', 'polite');
  const payEl = h('div', 'rvc-pe');
  const paySkel = h('div', 'rvc-skel');
  paySkel.append(h('i'), h('i'), h('i'));
  const payMsg = h('div', 'rv-msg rvc-msg');
  payMsg.setAttribute('aria-live', 'polite');
  const payGo = h('button', 'rvc-go');
  payGo.type = 'button';
  const payLegal = h('p', 'rvc-legal');
  payStep.append(payBack, paySummary, hold, paySkel, payEl, payMsg, payGo, payLegal);

  // ================================================================== wallet (crypto)
  const walletStep = h('section', 'rvc-step rva-wallet');
  const walletBack = h('button', 'rvc-link-btn', '← Edit');
  walletBack.type = 'button';
  const walletSummary = h('div', 'rvc-summary');
  const walletHold = h('p', 'rva-hold');
  walletHold.setAttribute('aria-live', 'polite');
  const walletBox = h('dl', 'rva-usdc');
  const walletMsg = h('div', 'rv-msg rvc-msg');
  walletMsg.setAttribute('aria-live', 'polite');
  const walletGo = h('button', 'rvc-go');
  walletGo.type = 'button';
  const walletLegal = h('p', 'rvc-legal');
  walletStep.append(walletBack, walletSummary, walletHold, walletBox, walletMsg, walletGo, walletLegal);

  // ================================================================== done
  const doneStep = h('section', 'rvc-step rva-done');
  const doneTitle = h('h3', 'rv-display rvc-done-title', 'Your ad is in review 🪩');
  doneTitle.tabIndex = -1;
  const donePreview = h('img', 'rva-preview rva-done-preview');
  donePreview.alt = 'Your ad';
  const doneLine = h('p', 'rvc-done-status');
  const doneOrder = h('p', 'rvc-done-order');
  const doneTx = h('p', 'rvc-done-order');
  doneTx.hidden = true;
  const doneClose = h('button', 'rvc-go', 'Back to the rave');
  doneClose.type = 'button';
  const doneRetry = h('button', 'rvc-link-btn', 'Send again');
  doneRetry.type = 'button';
  doneRetry.hidden = true;
  doneStep.append(doneTitle, donePreview, doneLine, doneTx, doneOrder, doneRetry, doneClose);

  root.append(pickStep, formStep, payStep, walletStep, doneStep);
  container.append(root);

  // ------------------------------------------------------------------ render
  const free = (slotId: string) => status.slots.find((s) => s.slotId === slotId)?.free === true;
  const freeCount = () => status.slots.filter((s) => s.free).length;

  function setStep(s: Step) {
    step = s;
    root.dataset.step = s;
    pickStep.hidden = s !== 'pick';
    formStep.hidden = s !== 'form';
    payStep.hidden = s !== 'pay';
    walletStep.hidden = s !== 'wallet';
    doneStep.hidden = s !== 'done';
    lede.hidden = s === 'done';
    testBanner.hidden = status.livemode || s === 'done';
    if (s !== 'pay' && s !== 'wallet' && holdTimer) {
      clearInterval(holdTimer);
      holdTimer = null;
    }
  }

  function renderPick() {
    if (pick && !free(pick.id)) pick = null;
    lede.textContent = `${AD_SLOTS.length} places in the world, ${formatCents(status.priceCents)} each for ${status.days} days. ${freeCount()} free right now. Every ad is checked before it goes live; if it is not approved you get a full refund.`;
    for (const s of AD_SLOTS) {
      const b = pins.get(s.id)!;
      const on = pick?.id === s.id;
      const isFree = free(s.id);
      b.classList.toggle('rva-on', on);
      b.classList.toggle('rva-is-taken', !isFree);
      b.disabled = !isFree || busy;
      b.setAttribute('aria-checked', String(on));
      b.setAttribute('aria-label', `${slotLabel(s)}, ${AD_KINDS[s.kind].label}, ${isFree ? 'free' : 'taken'}`);
    }
    pickInfo.replaceChildren();
    if (pick) {
      const [w, hh] = AD_KINDS[pick.kind].px;
      pickInfo.append(
        h('b', 'rv-display', `${slotLabel(pick)} · ${AD_KINDS[pick.kind].label}`),
        h('span', '', `Image ${w} × ${hh} (${shape(pick)}). Shown in the rave for ${status.days} days.`),
        h('span', 'rva-seen', `Seen in: ${AD_SEEN_IN[pick.kind]}.`),
      );
    } else pickInfo.append(h('span', 'rvc-hint', freeCount() ? 'Tap a free (green) slot on the map.' : 'All 20 slots are taken right now. Check back soon!'));
    pickGo.disabled = !pick || busy;
    pickGo.textContent = pick ? `Continue with ${slotLabel(pick)}` : 'Pick a slot above';
    pickGo.classList.toggle('rvc-go-idle', !pick);
  }

  const shape = (s: AdSlot) => ({ screen: '16:9', banner: '4:1', tower: '1:3 tall', blimp: '2:1', moon: '3:1' })[s.kind];

  function nameCheck() {
    return checkAdName(nameF.input.value);
  }
  function urlCheck() {
    return normalizeAdUrl(urlF.input.value);
  }
  function xCheck() {
    return normalizeXHandle(xF.input.value);
  }

  function renderForm(showAll = false) {
    if (!pick) return;
    const [w, hh] = AD_KINDS[pick.kind].px;
    slotLine.textContent = `${slotLabel(pick)} · ${AD_KINDS[pick.kind].label}`;
    // Two lines, so the label never runs into the edge of a narrow phone drop zone.
    if (image) dropText.textContent = 'Change image';
    else dropText.replaceChildren(h('b', '', 'Tap to add an image'), h('small', '', 'PNG, JPG or WebP up to 2 MB'));
    imgHint.textContent = `Cropped to ${shape(pick)} (${w} × ${hh}). Keep text big: it is seen from across the floor.`;
    drop.classList.toggle('rva-has', !!image);
    drop.style.aspectRatio = `${w} / ${hh}`;
    const show = (k: string) => showAll || touched.has(k);
    const n = nameCheck();
    nameF.msg.textContent = show('name') && !n.ok ? n.message : '';
    nameF.input.setAttribute('aria-invalid', String(show('name') && !n.ok));
    const u = urlCheck();
    urlF.msg.textContent = show('url') && !u.ok ? u.message : '';
    urlF.input.setAttribute('aria-invalid', String(show('url') && !u.ok));
    const x = xCheck();
    xF.msg.className = 'rvc-field-msg';
    xF.msg.textContent = show('x') && !x.ok ? X_HANDLE_MESSAGES[x.code] : '';
    xF.input.setAttribute('aria-invalid', String(show('x') && !x.ok));
    if (x.ok && x.handle) {
      xF.msg.className = 'rvc-field-msg rvc-ok';
      xF.msg.textContent = `Links to x.com/${x.handle}`;
    }
    if (showAll && !image) imgMsg.textContent = 'Add an image for your ad.';
    const price = formatCents(status.priceCents);
    const share = status.shelterBps > 0 ? Math.round(status.shelterBps / 100) : 0;
    const shelterLine = share ? `${share}% of it goes to the Pink Paw shelter on-chain; the rest funds the rave.` : 'It funds the rave; ad money is not part of the Pink Paw donation.';
    if (!status.card && method === 'card' && status.usdc.enabled) method = 'usdc';
    if (!status.usdc.enabled && method === 'usdc' && status.card) method = 'card';
    methodTabs.render(method, busy);
    const crypto = method === 'usdc';
    feeLabel.hidden = crypto;
    usdcNote.hidden = !crypto;
    const q = adQuote(status.priceCents, coverFee, status.fee);
    const feeIf = adQuote(status.priceCents, true, status.fee).feeCents;
    feeMain.textContent = `Cover the card fee (+${formatCents(feeIf)})`;
    feeSub.textContent = `Stripe’s card fee on top, so the full ${price} is paid. ${shelterLine}`;
    usdcNote.textContent = `Pay ${status.priceCents / 100} USDC from your wallet on Arc, straight to Token Tails. No card fee; Arc gas is a fraction of a cent, paid in USDC. The exact amount carries a tiny tag (1 to 2¢) so we can match your payment. ${shelterLine}`;
    totalVal.textContent = crypto ? `${formatCents(status.priceCents).slice(1)} USDC` : formatCents(q.amountCents);
    formGo.textContent = busy ? 'Reserving your slot…' : crypto ? `Continue · ${status.priceCents / 100} USDC on Arc` : `Continue · ${formatCents(q.amountCents)}`;
    formGo.disabled = busy;
    formGo.classList.toggle('rvc-busy', busy);
    formLegal.textContent = `Your slot is held for ${status.holdMinutes} minutes while you pay. Ads are reviewed before they show; ${
      crypto ? 'a rejected ad is refunded in full, by hand, in USDC to the wallet that paid' : 'a rejected ad is refunded in full'
    }. Ads open their link in a new tab, marked sponsored.${share ? ` ${share}% of every approved ad goes to the Pink Paw shelter on-chain.` : ''}`;
  }

  function setMsg(el: HTMLElement, text: string, tone: 'err' | 'ok' | '' = '') {
    el.className = `rv-msg rvc-msg${tone ? ` rv-${tone}` : ''}`;
    el.textContent = text;
  }

  // ------------------------------------------------------------------ events
  pickGo.addEventListener('click', () => {
    if (!pick) return;
    setStep('form');
    image = null;
    preview.hidden = true;
    imgMsg.textContent = '';
    touched.clear();
    setMsg(formMsg, '');
    renderForm();
    nameF.input.focus({ preventScroll: true });
  });
  back1.addEventListener('click', () => {
    if (busy) return;
    setStep('pick');
    renderPick();
  });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0] ?? null;
    fileInput.value = '';
    const c = checkImageFile(file);
    if (!c.ok || !file || !pick) {
      imgMsg.textContent = c.ok ? '' : c.message;
      return;
    }
    imgMsg.textContent = 'Cropping…';
    try {
      const out = await cropImageToSlot(file, AD_KINDS[pick.kind].px);
      if (image) URL.revokeObjectURL(image.url);
      image = out;
      preview.src = out.url;
      preview.hidden = false;
      imgMsg.textContent = '';
    } catch {
      imgMsg.textContent = 'That image could not be read. Try a PNG or JPG.';
    }
    renderForm();
  });
  for (const [k, f] of [
    ['name', nameF],
    ['url', urlF],
    ['x', xF],
  ] as const) {
    f.input.addEventListener('input', () => renderForm());
    f.input.addEventListener('blur', () => {
      touched.add(k);
      renderForm();
    });
  }
  feeBox.addEventListener('change', () => {
    coverFee = feeBox.checked;
    renderForm();
  });

  formGo.addEventListener('click', async () => {
    if (busy || !pick) return;
    const n = nameCheck();
    const u = urlCheck();
    const x = xCheck();
    if (!image || !n.ok || !u.ok || !x.ok) {
      renderForm(true);
      setMsg(formMsg, 'Check the fields above.', 'err');
      return;
    }
    const m = method;
    if (m === 'usdc' && !injectedProvider()) {
      setMsg(formMsg, '', 'err');
      fillNoWallet(formMsg, status.card);
      return;
    }
    busy = true;
    setMsg(formMsg, '');
    renderForm();
    try {
      order = await api.checkout({ slotId: pick.id, name: n.value, url: u.url, x: x.handle ?? '', coverFee: m === 'card' && coverFee, clientKey, image: image.blob, method: m });
    } catch (err) {
      busy = false;
      const e = err instanceof AdApiError ? err : null;
      if (e?.code === 'RAVE_AD_SLOT_TAKEN') {
        markTaken(pick.id);
        clientKey = newClientKey();
      } else if (e?.code === 'RAVE_AD_KEY_REUSED') clientKey = newClientKey();
      if (e?.code === 'RAVE_AD_NAME') nameF.msg.textContent = e.message;
      if (e?.code === 'RAVE_AD_URL') urlF.msg.textContent = e.message;
      if (e?.code === 'RAVE_AD_X_HANDLE') xF.msg.textContent = e.message;
      if (e?.code === 'RAVE_AD_IMAGE') imgMsg.textContent = e.message;
      renderForm();
      setMsg(formMsg, e?.message ?? 'Something went wrong. Try again.', 'err');
      if (e?.code === 'RAVE_AD_SLOT_TAKEN') {
        setStep('pick');
        renderPick();
        setMsg(formMsg, '');
        pickInfo.prepend(h('p', 'rv-msg rv-err', e.message));
      }
      return;
    }
    busy = false;
    renderForm();
    if (m === 'usdc') {
      if (!order.usdc) {
        setMsg(formMsg, order.status === 'held' ? 'Something went wrong on our side. Nothing was sent; try again.' : 'That hold ran out. Pick the slot again.', 'err');
        clientKey = newClientKey();
        return;
      }
      openWallet(order);
      return;
    }
    if (!order.clientSecret) {
      setMsg(formMsg, 'That hold ran out. Pick the slot again.', 'err');
      clientKey = newClientKey();
      return;
    }
    void openPay(order);
  });

  /** A fresh status: slots and which methods are open (an open card stays the default). */
  function applyStatus(next: AdsStatusOn) {
    status = next;
    methodTabs.setAvailability({ card: next.card, usdc: next.usdc.enabled, reasons: next.reasons });
    if (step === 'pick') method = defaultMethod({ card: next.card, usdc: next.usdc.enabled });
  }

  function markTaken(slotId: string) {
    status = { ...status, slots: status.slots.map((s) => (s.slotId === slotId ? { ...s, free: false } : s)) };
  }

  function startHold(o: AdOrder, el: HTMLElement) {
    const until = o.holdUntil ? Date.parse(o.holdUntil) : NaN;
    const tick = () => {
      if (!Number.isFinite(until)) {
        el.textContent = '';
        return;
      }
      const left = until - Date.now();
      el.textContent =
        left > 0
          ? `Slot held for you · ${fmtClock(left)}`
          : o.usdc
            ? 'The hold ran out. Pay now and you keep the slot if it is still free; otherwise the USDC is refunded by hand.'
            : 'The hold ran out. Pay now and you keep the slot if it is still free; otherwise you are refunded at once.';
      el.classList.toggle('rva-hold-low', left < 120_000);
    };
    tick();
    if (holdTimer) clearInterval(holdTimer);
    holdTimer = setInterval(tick, 1000);
  }

  function openWallet(o: AdOrder) {
    const pay = o.usdc!;
    setStep('wallet');
    const slot = adSlot(o.slotId)!;
    const amount = formatUnits6(pay.amount);
    walletSummary.replaceChildren(h('div', 'rvc-sum-line', `${slotLabel(slot)} · ${AD_KINDS[slot.kind].label}`), h('div', 'rvc-sum-line', `“${o.name}” → ${new URL(o.url).hostname}`));
    const row = (k: string, v: string, cls = '') => {
      const dt = h('dt', '', k);
      const dd = h('dd', cls, v);
      walletBox.append(dt, dd);
    };
    walletBox.replaceChildren();
    row('Send exactly', `${amount} USDC`, 'rv-display rva-usdc-amount');
    row('Network', pay.chainId === 5042 ? 'Arc' : 'Arc Testnet');
    row('To', `Token Tails · ${shortAddress(pay.recipient)}`);
    walletLegal.textContent = 'Your wallet sends one USDC transfer on Arc (it may first ask to switch to, or add, Arc). The tiny tag after the decimal point matches the payment to your ad. A rejected ad is refunded in full, by hand, in USDC to the wallet that paid.';
    setMsg(walletMsg, '');
    walletGo.disabled = false;
    walletBack.disabled = false;
    walletGo.textContent = `Send ${amount} USDC on Arc`;
    startHold(o, walletHold);
  }

  walletBack.addEventListener('click', () => {
    if (busy) return;
    setStep('form');
    renderForm();
  });
  walletGo.addEventListener('click', async () => {
    const o = order;
    if (busy || !o?.usdc) return;
    const provider = injectedProvider();
    if (!provider) {
      setMsg(walletMsg, '', 'err');
      fillNoWallet(walletMsg, false);
      return;
    }
    busy = true;
    walletGo.disabled = walletBack.disabled = true;
    walletGo.classList.add('rvc-busy');
    walletGo.textContent = 'Confirm in your wallet…';
    setMsg(walletMsg, '');
    let sent: { txHash: string; explorerUrl: string | null };
    try {
      sent = await sendAdUsdc({ provider, pay: o.usdc, priceCents: status.priceCents });
    } catch (err) {
      if (destroyed) return;
      busy = false;
      walletGo.classList.remove('rvc-busy');
      walletGo.disabled = walletBack.disabled = false;
      walletGo.textContent = `Send ${formatUnits6(o.usdc.amount)} USDC on Arc`;
      const code = (err as { code?: unknown })?.code;
      setMsg(
        walletMsg,
        /bad pay instruction/.test((err as Error)?.message ?? '')
          ? 'Something went wrong on our side. Nothing was sent.'
          : code === 'WRONG_CHAIN'
            ? 'Your wallet did not switch to Arc. Switch it to Arc yourself, then try again. Nothing was sent.'
            : walletMessage(err),
        'err',
      );
      return;
    }
    if (destroyed) return;
    busy = false;
    walletGo.classList.remove('rvc-busy');
    pendingTx = { adId: o.adId, txHash: sent.txHash };
    savePendingAdTx(pendingTx);
    txError = null;
    markTaken(o.slotId);
    done(o, sent);
    await reportTx();
  });

  /** Tells the server the transfer (retried by the poll until it sticks). */
  async function reportTx(): Promise<AdOrder | null> {
    const p = pendingTx;
    if (!p) return null;
    try {
      const row = await api.usdcTx(p.adId, p.txHash);
      pendingTx = null;
      savePendingAdTx(null);
      if (row) renderUsdcDone(row);
      return row;
    } catch (err) {
      if (finalTxError(err)) {
        pendingTx = null;
        savePendingAdTx(null);
        txError = `${(err as AdApiError).message} If you think the payment went through, write to us with the transaction link and ad ${p.adId}.`;
        if (pollTimer) clearTimeout(pollTimer);
        pollTimer = null;
        if (!destroyed && step === 'done') {
          doneTitle.textContent = 'Payment not matched';
          doneLine.textContent = txError;
          // The hold may still be open: the buyer can send the exact amount again for the same ad.
          doneRetry.hidden = !(order && order.adId === p.adId && order.usdc && order.holdUntil && Date.parse(order.holdUntil) > Date.now());
        }
      }
      return null;
    }
  }

  function renderUsdcDone(o: AdOrder) {
    if (destroyed || step !== 'done' || txError) return;
    const where = slotLabel(adSlot(o.slotId)!);
    doneTitle.textContent =
      o.status === 'held'
        ? 'Checking your payment 🪩'
        : o.status === 'review'
          ? 'Your ad is in review 🪩'
          : o.status === 'live'
            ? 'Your ad is live 🪩'
            : o.status === 'expired' || o.status === 'canceled'
              ? 'The hold ran out'
              : 'Not approved';
    switch (o.status) {
      case 'held':
        doneLine.textContent = 'Payment sent ✓ Checking it on Arc…';
        break;
      case 'review':
        doneLine.textContent = `Payment received ✓ “${o.name}” goes live on ${where} after a quick check (usually within a day) and stays up for ${status.days} days. If it is not approved, the USDC is refunded by hand to the wallet that paid.`;
        break;
      case 'live':
        doneLine.textContent = `“${o.name}” is live on ${where} ✓`;
        break;
      case 'expired':
      case 'canceled':
        doneLine.textContent = 'The hold ran out before the payment arrived. If the slot was taken meanwhile, the USDC is refunded by hand to the wallet that paid.';
        break;
      case 'rejected':
      case 'refunded':
        doneLine.textContent = 'This ad was not approved; the USDC is refunded by hand to the wallet that paid.';
        break;
      default:
        break;
    }
  }

  function pollUsdc(adId: string) {
    const started = Date.now();
    if (pollTimer) clearTimeout(pollTimer);
    const tick = async () => {
      pollTimer = null;
      if (destroyed || step !== 'done' || txError) return;
      let row: AdOrder | null = null;
      try {
        if (pendingTx) row = await reportTx();
        row = row ?? (await api.ad(adId));
      } catch {
        row = null;
      }
      if (destroyed || step !== 'done' || txError) return;
      if (row) {
        renderUsdcDone(row);
        if (row.status !== 'held') return;
      }
      const age = Date.now() - started;
      if (age > 15 * 60_000) {
        // Stop polling, but never leave "Checking…" on screen without an end.
        doneLine.textContent = `Still confirming on Arc. Your ad ${adId} moves to review once the transfer is seen; reopen this page later, or write to us with the transaction link.`;
        return;
      }
      pollTimer = setTimeout(tick, age < 2 * 60_000 ? 4_000 : 15_000);
    };
    pollTimer = setTimeout(tick, 4_000);
  }

  async function openPay(o: AdOrder) {
    setStep('pay');
    const slot = adSlot(o.slotId)!;
    paySummary.replaceChildren(h('div', 'rvc-sum-line', `${slotLabel(slot)} · ${AD_KINDS[slot.kind].label}`), h('div', 'rvc-sum-line', `“${o.name}” → ${new URL(o.url).hostname}`), h('div', 'rvc-sum-money rv-display', formatCents(o.amountCents)));
    payLegal.textContent = 'Payments by Stripe. Your ad goes live after a quick review; if it is not approved, the full payment is refunded.';
    setMsg(payMsg, '');
    paySkel.hidden = false;
    payEl.replaceChildren();
    payGo.disabled = true;
    payGo.textContent = `Pay ${formatCents(o.amountCents)}`;
    startHold(o, hold);
    payment?.destroy();
    payment = null;
    if (!status.publishableKey) {
      paySkel.hidden = true;
      setMsg(payMsg, 'Card payments are not available right now.', 'err');
      return;
    }
    try {
      const mounted = await mountPaymentElement(payEl, {
        publishableKey: status.publishableKey,
        clientSecret: o.clientSecret!,
        onReady: () => (paySkel.hidden = true),
        onComplete: (complete) => {
          if (!busy) payGo.disabled = !complete;
        },
        onLoadError: (m) => {
          paySkel.hidden = true;
          setMsg(payMsg, m, 'err');
        },
      });
      if (destroyed || step !== 'pay' || order !== o) return mounted.destroy();
      payment = mounted;
    } catch (err) {
      if (destroyed) return;
      paySkel.hidden = true;
      setMsg(payMsg, (err as Error).message || 'Card payments could not load.', 'err');
    }
  }

  payBack.addEventListener('click', () => {
    if (busy) return;
    payment?.destroy();
    payment = null;
    setStep('form');
    renderForm();
  });
  payGo.addEventListener('click', async () => {
    const o = order;
    if (busy || !payment || !o) return;
    busy = true;
    payGo.disabled = payBack.disabled = true;
    payGo.classList.add('rvc-busy');
    payGo.textContent = 'Paying… your bank may ask to confirm';
    setMsg(payMsg, '');
    let r: ConfirmOutcome;
    try {
      r = await payment.confirm();
    } catch {
      r = { ok: false, message: 'Something went wrong while paying. Try again (a payment is only ever taken once).', retry: true };
    } finally {
      payGo.classList.remove('rvc-busy');
    }
    if (destroyed) return;
    busy = false;
    payBack.disabled = false;
    payGo.textContent = `Pay ${formatCents(o.amountCents)}`;
    if (!r.ok) {
      payGo.disabled = false;
      setMsg(payMsg, r.declined ? `${r.message} ${declineNextStep(status.usdc.enabled).replace('switch to crypto', 'go back and switch to crypto')}` : r.message, 'err');
      if (r.declined) payment?.focus();
      return;
    }
    markTaken(o.slotId);
    done(o);
  });

  function done(o: AdOrder, usdcTx: { txHash: string; explorerUrl: string | null } | null = null) {
    setStep('done');
    payment?.destroy();
    payment = null;
    if (image) {
      donePreview.src = image.url;
      donePreview.hidden = false;
    } else donePreview.hidden = true;
    doneTx.replaceChildren();
    doneTx.hidden = !usdcTx;
    doneRetry.hidden = true;
    doneTitle.textContent = usdcTx ? 'Checking your payment 🪩' : 'Your ad is in review 🪩';
    if (usdcTx) {
      doneLine.textContent = 'Payment sent ✓ Checking it on Arc…';
      if (usdcTx.explorerUrl) {
        const a = h('a', '', 'View your payment on Arc ↗');
        a.href = usdcTx.explorerUrl;
        a.target = '_blank';
        a.rel = 'noopener';
        doneTx.append(a);
      } else doneTx.textContent = `Transaction ${usdcTx.txHash.slice(0, 10)}…`;
    } else {
      doneLine.textContent = `Paid, thank you! “${o.name}” goes live on ${slotLabel(adSlot(o.slotId)!)} after a quick check (usually within a day) and stays up for ${status.days} days. If it is not approved, you get a full refund.`;
    }
    doneOrder.textContent = `Ad ${o.adId}`;
    clientKey = newClientKey();
    opts.onPaid?.(o);
    requestAnimationFrame(() => doneTitle.focus({ preventScroll: true }));
    if (usdcTx) pollUsdc(o.adId);
    // The webhook may lag a moment; one read confirms the review state server side.
    else setTimeout(() => void api.ad(o.adId).catch(() => null), 2500);
  }
  doneClose.addEventListener('click', () => opts.onClose?.());
  doneRetry.addEventListener('click', () => {
    if (busy || !order?.usdc) return;
    txError = null;
    doneRetry.hidden = true;
    openWallet(order);
  });

  // A transfer sent in an earlier visit but never accepted by the server: report it again (best effort).
  const stored = loadPendingAdTx();
  if (stored) {
    void api
      .usdcTx(stored.adId, stored.txHash)
      .then(() => savePendingAdTx(null))
      .catch((err) => {
        if (finalTxError(err)) savePendingAdTx(null);
      });
  }

  setStep('pick');
  renderPick();

  return {
    select(slotId) {
      if (busy || step === 'pay') return;
      if (step === 'done') clientKey = newClientKey();
      const s = adSlot(slotId);
      if (s && free(s.id)) pick = s;
      setStep('pick');
      renderPick();
      // Fresh availability every time the sheet opens.
      void api
        .status()
        .then((st) => {
          if (destroyed || !st.enabled) return;
          applyStatus(st);
          opts.onStatus?.(st);
          if (step === 'pick') {
            if (!pick && s && free(s.id)) pick = s;
            renderPick();
          }
        })
        .catch(() => undefined);
    },
    setStatus(next) {
      applyStatus(next);
      if (step === 'pick') renderPick();
    },
    destroy() {
      destroyed = true;
      if (holdTimer) clearInterval(holdTimer);
      if (pollTimer) clearTimeout(pollTimer);
      payment?.destroy();
      if (image) URL.revokeObjectURL(image.url);
      root.remove();
    },
  };
}
