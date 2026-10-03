/**
 * True in dev servers and in builds made with VITE_HEIST_QA=1 (E2E, QA). Vite replaces both at build
 * time, so in a production build every `if (QA_BUILD)` branch is dead code: the QA module is not
 * bundled and the App's QA drivers (`qaStep`, `qaFeed`, `qaSetInput`) do nothing. No URL or devtools
 * call can then play a bundled solution as a real, saveable run.
 */
export const QA_BUILD: boolean = import.meta.env.DEV || import.meta.env.VITE_HEIST_QA === '1';
