/**
 * Shell -> wall/floor style (palette.ts SHELL_STYLES), matched on the shell name so new shells from the content
 * package get a sensible look without a render change. ShellDef.wallColor / floorColor still win.
 */
import type { ShellDef } from '../../types';
import { SHELL_STYLES, mixHex, shadeHex, type ShellStyle } from '../palette';

export function shellKey(sh: ShellDef): string {
  const n = (sh.name || '').toLowerCase();
  if (sh.width >= 14 || /boss|wedding|ballroom|hall/.test(n)) return 'boss';
  if (/bath/.test(n)) return 'bathroom';
  if (/office|study|zoom/.test(n)) return 'office';
  if (/party|club/.test(n)) return 'party';
  if (/bed|laundry|nap/.test(n)) return 'bedroom';
  if (/living|lounge|tv/.test(n)) return 'living';
  return 'kitchen';
}

export function shellStyle(sh: ShellDef): ShellStyle {
  const base = SHELL_STYLES[shellKey(sh)] ?? SHELL_STYLES.kitchen;
  const out: ShellStyle = { ...base };
  if (sh.wallColor !== undefined) {
    out.wallBack = sh.wallColor;
    out.wallSide = shadeHex(sh.wallColor, 0.95);
  }
  if (sh.floorColor !== undefined) {
    out.floorA = sh.floorColor;
    out.floorB = mixHex(sh.floorColor, shadeHex(sh.floorColor, 0.82), 0.85);
  }
  return out;
}
