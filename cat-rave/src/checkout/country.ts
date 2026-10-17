/**
 * L-UI: the buyer's country in the Add-a-cat sheet. Each Moon Rave cat holds its buyer's flag.
 *
 * The backend reads the country from the request IP (`GET /rave/geo`, data lane `fetchGeoCountry`). When
 * it has one, the picker stays hidden and the detected code rides along as a hidden value; the row then
 * says which flag the cats will hold, that it is public, and offers "Show my flag" (off = `"none"`, so
 * the order stores no country). When it has none (no header, `XX`, Tor, the call failed), the buyer can
 * pick a country here; with no pick the cats hold no flag. The body field is `country` (ISO 3166-1
 * alpha-2 or "none"), left out when there is nothing to send.
 */
import { cleanCountry, countryName, countryOptions, guessCountryFromLocale } from '../data/countries';
import { flagImg, optionFlag } from '../ui/board';

/** Per-viewer convenience: the last pick, so a second purchase keeps the same flag. Never read by the server. */
export const COUNTRY_PICK_KEY = 'rave.country';

type GetStore = Pick<Storage, 'getItem'> | null | undefined;
type SetStore = Pick<Storage, 'setItem' | 'removeItem'> | null | undefined;

export function rememberedCountry(storage: GetStore): string | null {
  try {
    return cleanCountry(storage?.getItem(COUNTRY_PICK_KEY) ?? null);
  } catch {
    return null;
  }
}

export function rememberCountry(storage: SetStore, code: string | null): void {
  try {
    if (code) storage?.setItem(COUNTRY_PICK_KEY, code);
    else storage?.removeItem(COUNTRY_PICK_KEY);
  } catch {
    /* private window or blocked storage: nothing to remember */
  }
}

/** The checkout body value for "no flag" (backend rave-country.ts: always wins, nothing is stored). */
export const NO_FLAG = 'none';

/**
 * What the checkout body carries: "none" when the buyer turned the flag off, else the IP country when
 * known, else the buyer's pick, else nothing.
 */
export function countryForRequest(detected: string | null | undefined, picked: string | null | undefined, optOut = false): string | null {
  if (optOut) return NO_FLAG;
  return cleanCountry(detected) ?? cleanCountry(picked);
}

/** `undefined` = still asking the server (row hidden until it answers), null = not detected. */
export type Detected = string | null | undefined;

/** The picker (a select) shows only once the server answered without a country. */
export const pickerVisible = (detected: Detected): boolean => detected === null;

export interface CountryPicker {
  /** The row for the build step: the detected flag with a "show my flag" switch, or the picker. */
  el: HTMLElement;
  /** Hidden input with the value the request will carry (the "hidden field"). */
  hidden: HTMLInputElement;
  /** The value for `CheckoutRequest.country` (a code or "none"), or null. */
  value(): string | null;
  /** The server's answer arrived (a code, or null when it could not tell). */
  setDetected(code: string | null): void;
  readonly detected: Detected;
}

export interface CountryPickerOptions {
  id: string;
  /** A code, null (not detected), or a promise of either (`fetchGeoCountry(api)`). */
  detected?: string | null | Promise<string | null>;
  storage?: (GetStore & SetStore) | null;
  /** `navigator.languages`: the locale guess goes on top of the list (never preselected). */
  languages?: readonly string[];
  onChange?(code: string | null): void;
}

function mk<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Public: the flag shows next to the cat names (and the X handle) on the floor and in GET /rave/cats. */
const PUBLIC_NOTE = 'Shown publicly with your cats, like their names.';

export function createCountryPicker(o: CountryPickerOptions): CountryPicker {
  let detected: Detected = undefined;
  const box = mk('div', 'rvc-country');
  const label = mk('label', 'rvc-legend', 'Your flag');
  label.append(mk('span', 'rvc-opt-tag', 'optional'));

  // Detected: "[flag] Germany · from your connection" and a switch to hold no flag.
  const known = mk('div', 'rvc-country-known');
  const knownFlag = mk('span', 'rvc-country-flag');
  const knownName = mk('span', 'rvc-country-name');
  const show = mk('input');
  show.type = 'checkbox';
  show.checked = true;
  show.id = `${o.id}-country-show`;
  const showLabel = mk('label', 'rvc-country-show');
  showLabel.htmlFor = show.id;
  showLabel.append(show, document.createTextNode(' Show my flag'));
  known.append(knownFlag, knownName, showLabel);

  // Not detected: the picker.
  const field = mk('div', 'rvc-country-field');
  const select = mk('select', 'rvc-input rvc-country-select');
  select.id = `${o.id}-country`;
  const none = mk('option', '', 'No flag');
  none.value = '';
  select.append(none);
  const guess = guessCountryFromLocale(o.languages ?? []);
  const remembered = rememberedCountry(o.storage);
  const top = [remembered, guess].filter((c): c is string => !!c);
  const list = countryOptions(top);
  list.forEach((c, i) => {
    const flag = optionFlag(c.code);
    const opt = mk('option', '', flag ? `${flag} ${c.name}` : c.name);
    opt.value = c.code;
    select.append(opt);
    // A thin divider after the suggestions on top.
    if (top.length && i === new Set(top).size - 1) {
      const sep = mk('option', '', '──────────');
      sep.disabled = true;
      select.append(sep);
    }
  });
  if (remembered) select.value = remembered;
  field.append(select);
  const help = mk('div', 'rvc-hint');
  help.id = `${o.id}-country-help`;
  select.setAttribute('aria-describedby', help.id);
  show.setAttribute('aria-describedby', help.id);
  const hidden = mk('input');
  hidden.type = 'hidden';
  hidden.name = 'country';
  box.append(label, known, field, help, hidden);

  const picked = () => cleanCountry(select.value);
  const current = () => countryForRequest(detected, picked(), typeof detected === 'string' && !show.checked);
  const sync = () => {
    const code = typeof detected === 'string' ? detected : null;
    box.hidden = detected === undefined;
    known.hidden = !code;
    field.hidden = !pickerVisible(detected);
    label.htmlFor = code ? show.id : select.id;
    if (code) {
      knownFlag.replaceChildren();
      const img = flagImg(code, 'rv-flag');
      if (img) knownFlag.append(img);
      knownName.textContent = `${countryName(code)} · from your connection`;
      help.textContent = show.checked ? `Your cats wave this flag on the floor. ${PUBLIC_NOTE}` : 'Your cats hold no flag. Nothing about where you are is saved.';
    } else {
      help.textContent = `We could not tell your country. Pick one and your cats wave its flag on the floor. ${PUBLIC_NOTE}`;
    }
    hidden.value = current() ?? '';
  };
  select.addEventListener('change', () => {
    rememberCountry(o.storage, picked());
    sync();
    o.onChange?.(current());
  });
  show.addEventListener('change', () => {
    sync();
    o.onChange?.(current());
  });

  const api: CountryPicker = {
    el: box,
    hidden,
    value: current,
    setDetected(code) {
      detected = cleanCountry(code);
      sync();
    },
    get detected() {
      return detected;
    },
  };
  sync();
  const d = o.detected;
  if (d === undefined) {
    /* the page never asks: stay hidden */
  } else if (d === null || typeof d === 'string') api.setDetected(d);
  else d.then((c) => api.setDetected(c), () => api.setDetected(null));
  return api;
}
