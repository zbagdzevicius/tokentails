/** `?perf=1` asks for the on-screen perf readout (ui/perfReadout.ts, loaded only then). */
export function perfFromUrl(search: string = typeof location !== 'undefined' ? location.search : ''): boolean {
  try {
    return new URLSearchParams(search).get('perf') === '1';
  } catch {
    return false;
  }
}
