/**
 * Type roles (plan F4, G12). The one vocabulary for text in the game, the landing's canvases and
 * the Heist: every Phaser Text, 2D canvas label and share card picks a role instead of a family.
 *
 * Pure data and string helpers. No Phaser, no DOM (ESLint enforces the Phaser ban), so the landing
 * and SSR can import it. The role table itself lives in `design/tokens.ts` (F3.1); this module adds
 * what a renderer needs: the CSS stack with the metric-matched fallback, a default size, the stroke.
 */
import { FONT_FAMILIES, GOLD, TYPE_ROLES as ROLE_TOKENS, type TypeRole } from "@/design/tokens";
import { FALLBACK_FAMILIES } from "./fonts.generated";

export type { TypeRole };

/** "Bark": the dark brown outline of `burst` text (GOLD.ink, 9.53:1 against gold-400). */
export const BARK = GOLD.ink;

export type RoleCase = "as-is" | "upper" | "sentence";

export interface TypeRoleSpec {
  /** The brand family name as declared in `@font-face` (or the mono stack for `code`). */
  family: string;
  weight: number;
  /** Never render smaller than this, in CSS px (before canvas resolution). */
  minPx: number;
  /** The size used when a call site does not pass one. */
  defaultPx: number;
  case: RoleCase;
  /** CSS font-family stack: family, its metric-matched fallbacks, then a generic family. */
  stack: string;
  /** Outline, as a colour and a thickness relative to the font size. */
  stroke?: { color: string; widthEm: number };
  /** Extra tracking in em (Bebas labels read better slightly open). */
  letterSpacingEm: number;
  lineHeight: number;
}

const DEFAULT_PX: Record<TypeRole, number> = {
  title: 32,
  hud: 20,
  label: 14,
  caption: 14,
  hint: 16,
  burst: 28,
  code: 12,
};

const LETTER_SPACING_EM: Record<TypeRole, number> = {
  title: 0,
  hud: 0.02,
  label: 0.04,
  caption: 0,
  hint: 0,
  burst: 0.01,
  code: 0,
};

const LINE_HEIGHT: Record<TypeRole, number> = {
  title: 1.05,
  hud: 1,
  label: 1.1,
  caption: 1.3,
  hint: 1.35,
  burst: 1,
  code: 1.3,
};

const quote = (family: string) => `"${family}"`;

/**
 * The CSS stack for a brand family: itself, its metric-matched fallback families (Arial-based,
 * then the Roboto one Android falls through to for bold weights), then `generic`.
 */
export function familyStack(family: string, generic = "sans-serif"): string {
  const fallbacks = FALLBACK_FAMILIES[family] ?? [];
  return [quote(family), ...fallbacks.map(quote), generic].join(", ");
}

/** Tailwind-ready stacks for the three brand families (see the 2d log for the config request). */
export const FONT_STACKS = {
  display: familyStack(FONT_FAMILIES.display),
  hud: familyStack(FONT_FAMILIES.hud),
  body: familyStack(FONT_FAMILIES.body),
  mono: FONT_FAMILIES.mono,
} as const;

function buildRole(role: TypeRole): TypeRoleSpec {
  const token = ROLE_TOKENS[role];
  const isMono = token.family === "mono";
  const spec: TypeRoleSpec = {
    family: isMono ? FONT_FAMILIES.mono : token.family,
    weight: token.weight,
    minPx: token.minPx,
    defaultPx: DEFAULT_PX[role],
    case: token.case,
    stack: isMono ? FONT_FAMILIES.mono : familyStack(token.family),
    letterSpacingEm: LETTER_SPACING_EM[role],
    lineHeight: LINE_HEIGHT[role],
  };
  if ("stroke" in token && token.stroke === "bark") spec.stroke = { color: BARK, widthEm: 0.14 };
  return spec;
}

export const TYPE_ROLE_NAMES = Object.keys(ROLE_TOKENS) as TypeRole[];

/** Every role, resolved. `TYPE_ROLES.hint.stack` is a ready CSS font-family value. */
export const TYPE_ROLES: Readonly<Record<TypeRole, TypeRoleSpec>> = Object.freeze(
  Object.fromEntries(TYPE_ROLE_NAMES.map((role) => [role, Object.freeze(buildRole(role))])) as Record<
    TypeRole,
    TypeRoleSpec
  >,
);

export function isTypeRole(value: unknown): value is TypeRole {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(ROLE_TOKENS, value);
}

/** A size for `role`: `size` (or the role default), rounded, never below the role minimum. */
export function roleSize(role: TypeRole, size?: number): number {
  const spec = TYPE_ROLES[role];
  const px = typeof size === "number" && Number.isFinite(size) ? size : spec.defaultPx;
  return Math.max(spec.minPx, Math.round(px));
}

// Built with the RegExp constructor: the client compiles to ES5, where `u` literals are refused.
const UPPER = new RegExp("\\p{Lu}", "u");
const LOWER = new RegExp("\\p{Ll}", "u");
const SENTENCE_START = new RegExp("(^|[.!?]\\s+)(\\p{Ll})", "gu");

/**
 * Applies the role's case. `sentence` turns SHOUTED copy into sentence case ("TAP TWO TILES. GO!"
 * becomes "Tap two tiles. Go!") and only capitalises the first letter of mixed-case copy, so cat
 * and shelter names keep their spelling. SHOUTED copy has no case to recover names from ("FEED MOCHI
 * AT KAUNAS" becomes "Feed mochi at kaunas"), so a hint that carries a name is written in sentence
 * case at the source, or created with `keepCase`.
 */
export function applyRoleCase(text: string, role: TypeRole): string {
  const mode = TYPE_ROLES[role].case;
  if (mode === "upper") return text.toLocaleUpperCase();
  if (mode !== "sentence") return text;
  const shouting = UPPER.test(text) && !LOWER.test(text);
  const base = shouting ? text.toLocaleLowerCase() : text;
  return base.replace(SENTENCE_START, (_, lead: string, letter: string) => lead + letter.toLocaleUpperCase());
}

/** The families (and weights) the game roles need, one entry per distinct face. */
export function roleFaces(): ReadonlyArray<{ family: string; weight: number; role: TypeRole }> {
  const seen = new Map<string, { family: string; weight: number; role: TypeRole }>();
  for (const role of TYPE_ROLE_NAMES) {
    const spec = TYPE_ROLES[role];
    if (ROLE_TOKENS[role].family === "mono") continue;
    const key = `${spec.family}|${spec.weight}`;
    if (!seen.has(key)) seen.set(key, { family: spec.family, weight: spec.weight, role });
  }
  return Array.from(seen.values());
}
