// PHOTO lane: inline SVG icons (procedural, no files).
const S = (body: string, vb = '0 0 24 24') => `<svg viewBox="${vb}" aria-hidden="true">${body}</svg>`;
const st = 'stroke="#2a1c14" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"';

export const ICON = {
  camera: S(
    `<path d="M3 8.5 Q3 6.5 5 6.5 H7.6 L9 4.5 H15 L16.4 6.5 H19 Q21 6.5 21 8.5 V17.5 Q21 19.5 19 19.5 H5 Q3 19.5 3 17.5 Z" fill="#fff7ea" ${st}/><circle cx="12" cy="13" r="4.2" fill="#4cc3ff" ${st}/><circle cx="13.3" cy="11.7" r="1.2" fill="#fff"/><circle cx="18" cy="9.2" r="1" fill="#ff4f7b"/>`,
  ),
  back: S(`<path d="M15 5 L8 12 L15 19" fill="none" ${st} stroke-width="3"/>`),
  eye: S(`<path d="M2.5 12 Q12 3.5 21.5 12 Q12 20.5 2.5 12 Z" fill="#fff" ${st}/><circle cx="12" cy="12" r="3.4" fill="#2a1c14"/>`),
  eyeOff: S(`<path d="M2.5 12 Q12 3.5 21.5 12 Q12 20.5 2.5 12 Z" fill="#fff" ${st}/><circle cx="12" cy="12" r="3.4" fill="#2a1c14"/><path d="M4 20 L20 4" fill="none" ${st} stroke-width="3"/>`),
  dice: S(
    `<rect x="3.5" y="3.5" width="17" height="17" rx="4" fill="#fff7ea" ${st}/><circle cx="8.3" cy="8.3" r="1.5" fill="#2a1c14"/><circle cx="15.7" cy="8.3" r="1.5" fill="#2a1c14"/><circle cx="12" cy="12" r="1.5" fill="#ff4f7b"/><circle cx="8.3" cy="15.7" r="1.5" fill="#2a1c14"/><circle cx="15.7" cy="15.7" r="1.5" fill="#2a1c14"/>`,
  ),
  minus: S(`<path d="M6 12 H18" fill="none" ${st} stroke-width="3"/>`),
  plus: S(`<path d="M6 12 H18 M12 6 V18" fill="none" ${st} stroke-width="3"/>`),
  rotL: S(`<path d="M7 9 A7 7 0 1 1 6 15" fill="none" ${st}/><path d="M3.5 5.5 L7 9.5 L11 7" fill="none" ${st}/>`),
  rotR: S(`<path d="M17 9 A7 7 0 1 0 18 15" fill="none" ${st}/><path d="M20.5 5.5 L17 9.5 L13 7" fill="none" ${st}/>`),
  front: S(`<rect x="3" y="9" width="11" height="11" rx="2" fill="#fff" ${st}/><rect x="10" y="4" width="11" height="11" rx="2" fill="#ffc21a" ${st}/>`),
  trash: S(`<path d="M5 7 H19 M9.5 7 V4.5 H14.5 V7 M6.5 7 L7.5 20 H16.5 L17.5 7" fill="#fff" ${st}/><path d="M10.3 10.5 V16.5 M13.7 10.5 V16.5" fill="none" ${st}/>`),
  share: S(`<path d="M12 3.5 V14 M7.5 8 L12 3.5 L16.5 8" fill="none" ${st} stroke="#fff7ea" stroke-width="2.6"/><path d="M5 12 V19 Q5 20.5 6.5 20.5 H17.5 Q19 20.5 19 19 V12" fill="none" stroke="#fff7ea" stroke-width="2.6" stroke-linecap="round"/>`),
  save: S(`<path d="M12 3.5 V14.5 M7.5 10 L12 14.5 L16.5 10" fill="none" ${st} stroke-width="2.6"/><path d="M5 17 V19 Q5 20.5 6.5 20.5 H17.5 Q19 20.5 19 19 V17" fill="none" ${st} stroke-width="2.6"/>`),
  reset: S(`<circle cx="12" cy="12" r="7.5" fill="#fff" ${st}/><circle cx="12" cy="12" r="2.2" fill="#ff8a2a" ${st}/>`),
} as const;

/** small pose glyphs (cat silhouettes) for the POSE tab */
const CAT = 'fill="#ff9a3c" stroke="#2a1c14" stroke-width="2" stroke-linejoin="round"';
export const POSE_ICON: Record<string, string> = {
  none: S(`<circle cx="16" cy="16" r="10" fill="#fff" stroke="#2a1c14" stroke-width="2"/><path d="M9 23 L23 9" stroke="#2a1c14" stroke-width="2.4"/>`, '0 0 32 32'),
  sit: S(`<path d="M10 28 Q8 16 13 12 L12 5 L16 9 L20 5 L19 12 Q24 16 22 28 Z" ${CAT}/><path d="M22 26 Q29 25 27 18" fill="none" stroke="#2a1c14" stroke-width="2"/>`, '0 0 32 32'),
  wave: S(`<path d="M9 28 Q7 16 12 12 L11 5 L15 9 L19 5 L18 12 Q23 16 21 28 Z" ${CAT}/><path d="M20 16 Q25 12 26 6" fill="none" stroke="#2a1c14" stroke-width="3.4" stroke-linecap="round"/><path d="M20 16 Q25 12 26 6" fill="none" stroke="#ff9a3c" stroke-width="1.6" stroke-linecap="round"/>`, '0 0 32 32'),
  loaf: S(`<path d="M4 26 Q4 15 14 15 L14 10 L17 13 L20 10 L21 15 Q29 16 28 26 Z" ${CAT}/>`, '0 0 32 32'),
  stretch: S(`<path d="M3 26 L8 22 Q12 24 18 18 Q22 15 24 18 L24 12 L27 15 L29 13 L28 20 Q28 26 26 27 L22 27 L20 23 Q14 27 9 27 Z" ${CAT}/>`, '0 0 32 32'),
  leap: S(`<path d="M3 22 Q10 10 20 11 L22 6 L24 10 L27 8 L26 13 Q28 16 26 18 Q18 18 13 22 L6 27 Z" ${CAT}/>`, '0 0 32 32'),
  proud: S(`<path d="M10 28 Q8 18 12 14 L10 5 L15 10 L19 4 L19 13 Q24 17 22 28 Z" ${CAT}/><path d="M13 3 L15 0.5 L17 3 L19 0.5 L21 3 V5 H13 Z" fill="#ffc21a" stroke="#2a1c14" stroke-width="1.4"/>`, '0 0 32 32'),
};
