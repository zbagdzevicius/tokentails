/**
 * QA counters for the audio-ui lane (e2e reads them from `window.__fmUi`): camera shakes that got through (reduced
 * motion must keep this at 0), announcer lines spoken and captions shown. Plain numbers, no behaviour.
 */
export const qa = {
  shakes: 0,
  lines: 0,
  captions: 0,
  wipes: 0,
};

if (typeof window !== 'undefined') (window as unknown as { __fmUi?: unknown }).__fmUi = qa;
