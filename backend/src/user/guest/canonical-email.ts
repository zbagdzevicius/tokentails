/*
 * Canonical email (2a review finding #5): the one inbox an address delivers to, for abuse checks
 * only. Never used to sign in or to look an account up for binding; `email` stays the address the
 * person typed (lowercased).
 *
 * Gmail ignores dots in the local part and everything after `+`, and googlemail.com is the same
 * mailbox, so `M.e+1@googlemail.com` and `me@gmail.com` are one person. Other providers are left as
 * they are: plus addressing is not universal and dots are significant elsewhere.
 *
 * scripts/backfill-identity-fields.js computes the same value server side (`canonicalEmailExpr`);
 * identity-mongo.spec.ts checks the two agree.
 */

const GMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com']);

export function canonicalEmail(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null;
    }
    const email = value.trim().toLowerCase();
    const at = email.lastIndexOf('@');
    if (at <= 0 || at === email.length - 1) {
        return null;
    }
    const local = email.slice(0, at);
    const domain = email.slice(at + 1);
    if (!GMAIL_DOMAINS.has(domain)) {
        return email;
    }
    const base = local.split('+')[0].replace(/\./g, '');
    return base ? `${base}@gmail.com` : null;
}

/** Both addresses deliver to the same inbox (false when either is unusable). */
export const sameInbox = (a: unknown, b: unknown): boolean => {
    const left = canonicalEmail(a);
    return !!left && left === canonicalEmail(b);
};
