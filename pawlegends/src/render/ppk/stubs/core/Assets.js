// Lifted from Pink Paw Knight (swordcat) at commit 7714dcb: src/core/Assets.js (generated stub, not the PPK file)
// Licence: all rights reserved, pending founder decision (POC.md §17, GDD §12 decision #3). Not MIT.
// Changes: relative imports rewritten by tools/lift-ppk.mjs; any later hand edit is marked "pawlegends:".
// Not lifted: PPK asset loader; characters/util.js only needs a URL resolver (Pawlegends characters load no asset files).
export function assetUrl(p) { return `${(typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || './'}assets/${p}`; }
