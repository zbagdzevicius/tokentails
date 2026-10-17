/**
 * Studio / reply template @handle (GDD 6.2): "I put @luna.mom's cat in my game". Only the caption overlay uses it;
 * it is returned in CatMakerResult.handle and never stored or put in a link. Pure.
 */

export const HANDLE_MAX = 24;

/**
 * '@' + up to 24 of [a-z0-9._] (lowercased; spaces, emoji, extra '@'s and anything else dropped).
 * Returns '' when nothing usable is left.
 */
export function filterHandle(raw: string): string {
  const body = String(raw ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9._]/g, '')
    .slice(0, HANDLE_MAX);
  return body && /[a-z0-9]/.test(body) ? '@' + body : '';
}
