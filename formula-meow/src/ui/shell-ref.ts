/**
 * The shell, for the audio-ui lane's lazy screens (settings, how to play): the install sets it once, the screen
 * chunks read it when they mount. Type-only import of the shell, so the screens never pull the shell into their chunk.
 */
import type { Shell } from '../core/app/shell';

let ref: Shell | null = null;

export function setUiShell(s: Shell): void {
  ref = s;
}

export function uiShell(): Shell | null {
  return ref;
}
