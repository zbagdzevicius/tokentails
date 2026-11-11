/**
 * Every host message, sanitized (integration plan §1): the envelope plus the known fields of its type, unknown
 * fields dropped and bad optional fields removed, or null when the message must be ignored. The game's half of
 * `shared/pawlegends-bridge.fixtures.json` (tests/unit/bridge-fixtures.test.ts reads it). Pure.
 */
import { parseRoster } from '../meta/roster';
import {
  EMBED_NS,
  EMBED_VERSION,
  parseApp,
  parseAudio,
  parseChampions,
  parseEntitlements,
  parseFeatured,
  parseHostMessage,
  parseOffer,
  parsePartyTicket,
  parsePurchaseResult,
  parseSaveResult,
  parseSession,
  parseSkuPurchaseResult,
  parseStoreState,
  type HostMessage,
} from './bridge';
import { parseApiResult } from './api';

export function sanitizeHostMessage(data: unknown, opts: { isApp?: boolean } = {}): HostMessage | null {
  const m = parseHostMessage(data);
  if (!m) return null;
  const env = { ns: EMBED_NS, v: EMBED_VERSION, type: m.type };
  const wrap = (p: object | null | undefined): HostMessage | null => (p ? ({ ...env, ...p } as HostMessage) : null);
  switch (m.type) {
    case 'hello':
    case 'pause':
    case 'resume':
      return env as HostMessage;
    case 'session':
      return wrap(parseSession(m));
    case 'save-result':
      return wrap(parseSaveResult(m));
    case 'roster':
      // the wire shape: `family` and `variant` are derived from `sprite` in the game, never sent
      return Array.isArray(m.cats) ? wrap({ cats: parseRoster(m.cats, { isApp: opts.isApp ?? false }).map(({ family: _f, variant: _v, ...c }) => c) }) : null;
    case 'featured': {
      const cats = parseFeatured(m);
      return cats ? wrap({ cats }) : null;
    }
    case 'offer': {
      const offer = parseOffer(m);
      return offer === undefined ? null : wrap({ offer });
    }
    case 'app':
      return wrap(parseApp(m));
    case 'purchase-result':
      // STORE-PASS.md: a store or pass SKU's result, else a Token Tails cat's
      return wrap(parseSkuPurchaseResult(m) ?? parsePurchaseResult(m));
    case 'store':
      return wrap(parseStoreState(m));
    case 'audio':
      return wrap(parseAudio(m));
    case 'entitlements':
      return wrap(parseEntitlements(m));
    case 'party-ticket':
      return wrap(parsePartyTicket(m));
    case 'api-result':
      return wrap(parseApiResult(m));
    case 'champions': {
      // The wire shape (sim v9): only the champion catalog ids the game knows, `catImg` from the NFT bucket only.
      const cats = parseChampions(m);
      return cats ? wrap({ cats: cats.map((c) => ({ catalogId: c.catalogId, forSale: c.forSale, ...(c.art ? { catImg: c.art } : {}) })) }) : null;
    }
    default:
      return null;
  }
}
