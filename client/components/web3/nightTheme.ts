/**
 * Third-party payment surfaces in the night language (plan G6 "Third parties", task 3d).
 *
 * Stripe Elements and the Stellar Wallets Kit render in their own iframe / shadow DOM, where the
 * `--tt-*` custom properties do not reach, so they take concrete hex values from the tokens.
 */
import type { Appearance } from "@stripe/stripe-js";
import { GOLD, INK, NIGHT, STATES } from "@/design/tokens";

/** Stripe Elements: the built-in `night` theme with token variables. */
export const NIGHT_STRIPE_APPEARANCE: Appearance = {
  theme: "night",
  variables: {
    colorPrimary: GOLD[400],
    colorBackground: NIGHT[700],
    colorText: INK.cream,
    colorTextSecondary: INK.muted,
    colorTextPlaceholder: INK.muted,
    colorDanger: STATES.rust,
    colorSuccess: STATES.mint,
    colorIcon: INK.cream,
    // System font on purpose. Stripe's iframe runs on js.stripe.com: it cannot fetch our
    // self-hosted /fonts/*.woff2 (no CORS header) and plan F4 bans Google Fonts, so naming
    // "Nunito" here would only ever fall back. Revisit if the font route gets a CORS header.
    // eslint-disable-next-line tt/no-raw-font -- third-party iframe: type roles and --tt-* do not reach it
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    borderRadius: "8px",
  },
  rules: {
    ".Input": {
      backgroundColor: NIGHT[600],
      border: `1px solid ${GOLD[500]}`,
      color: INK.cream,
    },
    ".Input:focus": {
      borderColor: GOLD[400],
      boxShadow: `0 0 0 2px ${GOLD[400]}`,
    },
    ".Tab": {
      backgroundColor: NIGHT[600],
      border: `1px solid ${NIGHT[500]}`,
    },
    ".Tab--selected": {
      borderColor: GOLD[400],
    },
    ".Label": {
      color: INK.cream,
    },
  },
};

/**
 * Stellar Wallets Kit (`StellarWalletsKit.init({ theme })`). Same keys as the kit's
 * `SwkAppTheme`; typed locally so this module stays importable without the browser-only SDK.
 */
export const NIGHT_WALLET_KIT_THEME = {
  background: NIGHT[700],
  "background-secondary": NIGHT[800],
  "foreground-strong": INK.cream,
  foreground: INK.cream,
  "foreground-secondary": INK.muted,
  primary: GOLD[400],
  "primary-foreground": GOLD.ink,
  transparent: "rgba(0, 0, 0, 0)",
  lighter: NIGHT[600],
  light: NIGHT[600],
  "light-gray": INK.muted,
  gray: NIGHT[500],
  danger: STATES.rust,
  border: NIGHT[500],
  shadow: "0 10px 30px -6px rgba(0, 0, 0, 0.6)",
  "border-radius": "0.5rem",
  // eslint-disable-next-line tt/no-raw-font -- third-party iframe/shadow DOM: type roles and --tt-* do not reach it
  "font-family": '"Nunito", "Nunito Fallback", system-ui, sans-serif',
} as const;
