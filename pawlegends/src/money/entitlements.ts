/**
 * What the player owns and what the host allows (POC.md §8.2, §11.1). The host sends `entitlements{token}`: a
 * backend-signed `<base64url(JSON)>.<sig>` (`backend/src/pawlegends/pawlegends-token.ts`). The game cannot and need
 * not verify it: it only decides which cosmetics to draw, the server verifies the token whenever it matters (upgrade,
 * offers, restore). The game reads `items` and `skus` and drops anything it does not know.
 *
 * `app{isApp, store, notify}`: in app builds there is no checkout, no offer and no purchased cosmetic (GDD §9.8),
 * even when a token arrives. `store` now means "the Token Tails cat checkout is reachable" (web, not app): it opens
 * the Meet card (`catCheckout`). The game's own `pl_*` store is retired (integration plan §2): `storeOpen` is always
 * false, so the old store button and offer card never show, while tokens bought earlier still dress the heroes.
 * Outside an embed there is no host, so no checkout at all.
 *
 * The token lives in memory only: the host keeps it and re-sends it on every `ready`.
 */
import { KNOWN_ITEMS, isSku, type SkuId } from './skus';

export interface TokenPayload {
  items: string[];
  skus: SkuId[];
  expiresAt: number;
}

const TOKEN = /^([A-Za-z0-9_-]{1,8000})\.([A-Za-z0-9_-]{16,128})$/;

function b64urlToText(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** The display payload of a token (known items and SKUs only), or null for anything malformed. Never throws. */
export function decodeToken(token: unknown, now = Date.now()): TokenPayload | null {
  if (typeof token !== 'string') return null;
  const m = TOKEN.exec(token);
  if (!m) return null;
  try {
    const o = JSON.parse(b64urlToText(m[1])) as Record<string, unknown>;
    if (!o || typeof o !== 'object' || !Array.isArray(o.items) || !Array.isArray(o.skus)) return null;
    const expiresAt = typeof o.expiresAt === 'number' && Number.isFinite(o.expiresAt) ? o.expiresAt : 0;
    if (expiresAt <= now) return null;
    const items = [...new Set(o.items.filter((i): i is string => typeof i === 'string' && KNOWN_ITEMS.has(i)))];
    const skus = [...new Set(o.skus.filter(isSku))];
    return { items, skus, expiresAt };
  } catch {
    return null;
  }
}

export interface StoreSnapshot {
  /** Framed by a host that answered the handshake. */
  embedded: boolean;
  isApp: boolean;
  /** Retired `pl_*` store: always false (kept so older callers compile and stay closed). */
  storeOpen: boolean;
  /** The host can open its Token Tails cat checkout (embedded, web build, `app.store`): the Meet card may show. */
  catCheckout: boolean;
  /** The host can take a "notify me" sign-up (additive `app.notify`; hidden until the host says so). */
  notifyOpen: boolean;
  signedIn: boolean;
  /** Purchased items the game may draw (empty in app builds). */
  items: ReadonlySet<string>;
  skus: ReadonlySet<SkuId>;
}

/** Host-fed store state with change listeners. One per page. */
export class Entitlements {
  private embedded = false;
  private isApp = false;
  private store = false;
  private notify = false;
  private signedIn = false;
  private payload: TokenPayload | null = null;
  private listeners: ((s: StoreSnapshot) => void)[] = [];

  /** Feed a host message (`app`, `entitlements`, `session`, `hello`). Returns true when the state changed. */
  apply(m: { type: string; [k: string]: unknown }): boolean {
    const before = JSON.stringify(this.snapshotKey());
    switch (m.type) {
      case 'hello':
        this.embedded = true;
        break;
      case 'app':
        this.embedded = true;
        this.isApp = m.isApp === true;
        // An older host sends no `store`; only an explicit true opens the store.
        this.store = m.store === true && !this.isApp;
        this.notify = m.notify === true && !this.isApp;
        break;
      case 'entitlements':
        this.payload = decodeToken(m.token);
        break;
      case 'session':
        this.signedIn = m.signedIn === true;
        break;
      default:
        return false;
    }
    const changed = JSON.stringify(this.snapshotKey()) !== before;
    if (changed) {
      const s = this.snapshot();
      for (const l of this.listeners) l(s);
    }
    return changed;
  }

  private snapshotKey(): unknown[] {
    return [this.embedded, this.isApp, this.store, this.notify, this.signedIn, this.payload?.items, this.payload?.skus];
  }

  snapshot(): StoreSnapshot {
    const paid = !this.isApp && this.payload ? this.payload : null;
    return {
      embedded: this.embedded,
      isApp: this.isApp,
      storeOpen: false,
      catCheckout: this.embedded && this.store && !this.isApp,
      notifyOpen: this.embedded && this.notify && !this.isApp,
      signedIn: this.signedIn,
      items: new Set(paid?.items ?? []),
      skus: new Set(paid?.skus ?? []),
    };
  }

  onChange(fn: (s: StoreSnapshot) => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }
}
