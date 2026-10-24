// Inline SVG icons for the Trail Maker UI (TRAILS lane). Procedural, no files.
const INK = '#2a1c14';
const svg = (inner: string, fill = 'none'): string =>
  `<svg viewBox="0 0 24 24" fill="${fill}" stroke="${INK}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

export const IC = {
  maker: svg('<path d="M4 21 Q4 13 10 12 T18 5" stroke="#ff8a2a" stroke-width="4"/><path d="M4 21 Q4 13 10 12 T18 5" stroke-dasharray="1 4"/><path d="M17 2 V10" /><path d="M17 2.5 L22 4.5 L17 6.5Z" fill="#ffc21a"/>'),
  back: svg('<path d="M15 4 L7 12 L15 20" stroke-width="4"/>'),
  play: svg('<path d="M7 4 L20 12 L7 20Z" fill="#7ccf5a"/>'),
  edit: svg('<path d="M4 20 L5 15 L16 4 L20 8 L9 19Z" fill="#ffc21a"/><path d="M14 6 L18 10"/>'),
  share: svg('<circle cx="18" cy="5" r="2.6" fill="#4cc3ff"/><circle cx="6" cy="12" r="2.6" fill="#4cc3ff"/><circle cx="18" cy="19" r="2.6" fill="#4cc3ff"/><path d="M8.3 10.8 L15.7 6.3 M8.3 13.2 L15.7 17.7"/>'),
  trash: svg('<path d="M4 7 H20 M9 7 V4 H15 V7"/><path d="M6 7 L7 21 H17 L18 7Z" fill="#ff4f7b"/><path d="M10 11 V17 M14 11 V17"/>'),
  plus: svg('<path d="M12 4 V20 M4 12 H20" stroke-width="3.6"/>'),
  dice: svg('<rect x="3.5" y="3.5" width="17" height="17" rx="4" fill="#fff7ea"/><circle cx="8.5" cy="8.5" r="1.4" fill="#2a1c14" stroke="none"/><circle cx="15.5" cy="15.5" r="1.4" fill="#2a1c14" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="#2a1c14" stroke="none"/><circle cx="15.5" cy="8.5" r="1.4" fill="#2a1c14" stroke="none"/><circle cx="8.5" cy="15.5" r="1.4" fill="#2a1c14" stroke="none"/>'),
  shuffle: svg('<path d="M3 7 H7 Q11 7 12 12 T17 17 H21 M18 14 L21 17 L18 20"/><path d="M3 17 H7 Q9 17 10 15 M14 9 Q15 7 17 7 H21 M18 4 L21 7 L18 10"/>'),
  mirror: svg('<path d="M12 3 V21" stroke-dasharray="2 3"/><path d="M9 6 L3 12 L9 18Z" fill="#ffc21a"/><path d="M15 6 L21 12 L15 18Z" fill="#fff7ea"/>'),
  hard: svg('<path d="M12 2 Q18 8 17 14 Q16 21 12 21 Q7 21 7 15 Q7 11 10 9 Q10 13 12 13 Q11 7 12 2Z" fill="#ff4f7b"/>'),
  left: svg('<path d="M15 5 L8 12 L15 19" stroke-width="3.4"/>'),
  right: svg('<path d="M9 5 L16 12 L9 19" stroke-width="3.4"/>'),
  check: svg('<path d="M4 12.5 L9.5 18 L20 6" stroke="#2a1c14" stroke-width="3.6"/>'),
  copy: svg('<rect x="8" y="8" width="12" height="13" rx="2.5" fill="#fff7ea"/><path d="M5 16 V5 Q5 3 7 3 H15"/>'),
};
