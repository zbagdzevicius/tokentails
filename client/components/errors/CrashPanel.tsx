import {
  useEffect,
  useId,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { FONT_FAMILIES, THEME_COLOR } from "@/design/tokens";
import { FALLBACK_COPY } from "./copy";

/**
 * The fallback every boundary shows (F9, decision #89). Self-contained on
 * purpose: inline styles, a local stylesheet string, a mascot served from
 * /public and no context, so it still renders when the provider tree, the
 * CDN or the global CSS is what broke.
 */

export interface CrashAction {
  label: string;
  onClick: () => void;
  primary?: boolean;
  testId?: string;
}

export type CrashPanelVariant = "screen" | "inline";

interface CrashPanelProps {
  /** One-line explanation under the title. */
  body: string;
  actions: CrashAction[];
  variant?: CrashPanelVariant;
  /** Stacking for the `screen` variant (the F3 layer value). */
  zIndex?: number;
  /**
   * The `screen` variant blocks the whole app: `aria-modal` plus a Tab trap.
   * False for a fallback that sits under other live UI (the scene fallback
   * at z 90, below lobby modals), which must not claim to be modal.
   */
  modal?: boolean;
  testId?: string;
}

// Night palette (G6): the landing's night sky and coin accents.
export const NIGHT = {
  sky: THEME_COLOR,
  skyGlow: "#2a1552",
  panelTop: "#2b1848",
  panelBottom: "#150b2c",
  outline: "#05030f",
  cream: "#fcecbb",
  coin: "#ffc93c",
  coinShade: "#b7791f",
  lavender: "#c9b8ec",
  violet: "#9966cc",
  focus: "#c4e2fc",
} as const;

const FONT_DISPLAY = `"${FONT_FAMILIES.display}", "${FONT_FAMILIES.hud}", ui-rounded, system-ui, sans-serif`;
const FONT_BODY = `"${FONT_FAMILIES.body}", ui-rounded, system-ui, sans-serif`;

// Hover and focus rings cannot be inline styles. Scoped by the `tt-crash`
// prefix and shipped with the panel so it works without globals.scss.
const PANEL_CSS = `
.tt-crash-btn{transition:transform .08s ease,filter .12s ease}
.tt-crash-btn:hover{filter:brightness(1.08);transform:translateY(-1px)}
.tt-crash-btn:active{transform:translateY(2px)}
.tt-crash-btn:focus-visible{outline:3px solid ${NIGHT.focus};outline-offset:3px}
@keyframes tt-crash-in{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}
@keyframes tt-crash-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
.tt-crash-card{animation:tt-crash-in .22s ease-out both}
.tt-crash-cat{animation:tt-crash-bob 3.2s ease-in-out infinite}
@media (prefers-reduced-motion: reduce){.tt-crash-card,.tt-crash-cat{animation:none}.tt-crash-btn{transition:none}}
`;

const screenStyle = (zIndex: number): CSSProperties => ({
  position: "fixed",
  inset: 0,
  zIndex,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding:
    "max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left))",
  background: `radial-gradient(120% 80% at 50% 0%, ${NIGHT.skyGlow} 0%, ${NIGHT.sky} 62%)`,
  overflowY: "auto",
});

const inlineStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "100%",
  minHeight: 240,
  padding: 16,
};

const cardStyle = (variant: CrashPanelVariant): CSSProperties => ({
  boxSizing: "border-box",
  width: "100%",
  maxWidth: variant === "screen" ? 420 : 360,
  padding: "28px 24px 24px",
  borderRadius: 8,
  background: `linear-gradient(180deg, ${NIGHT.panelTop} 0%, ${NIGHT.panelBottom} 100%)`,
  border: `4px solid ${NIGHT.outline}`,
  boxShadow: `inset 0 2px 0 rgba(255,255,255,.14), inset 0 0 0 2px rgba(153,102,204,.35), 6px 6px 0 0 ${NIGHT.outline}`,
  color: NIGHT.cream,
  textAlign: "center",
  // eslint-disable-next-line tt/no-raw-font -- the fallback renders with no providers or global styles (F9)
  fontFamily: FONT_BODY,
});

const buttonStyle = (primary: boolean): CSSProperties => ({
  boxSizing: "border-box",
  // Side by side when both fit, otherwise one full-width button per row.
  flex: "1 1 150px",
  whiteSpace: "nowrap",
  minHeight: 48,
  padding: "10px 16px",
  borderRadius: 6,
  border: `3px solid ${NIGHT.outline}`,
  background: primary ? NIGHT.coin : "transparent",
  color: primary ? NIGHT.outline : NIGHT.cream,
  boxShadow: primary
    ? `inset 0 -4px 0 ${NIGHT.coinShade}, 0 3px 0 ${NIGHT.outline}`
    : `inset 0 0 0 2px ${NIGHT.violet}`,
  // eslint-disable-next-line tt/no-raw-font -- the fallback renders with no providers or global styles (F9)
  fontFamily: FONT_DISPLAY,
  fontSize: 20,
  letterSpacing: "0.04em",
  lineHeight: 1,
  textTransform: "uppercase",
  cursor: "pointer",
});

export const CrashPanel = ({
  body,
  actions,
  variant = "screen",
  zIndex = 600,
  modal = variant === "screen",
  testId,
}: CrashPanelProps) => {
  const isModal = variant === "screen" && modal;
  const titleId = useId();
  const bodyId = useId();
  const primaryRef = useRef<HTMLButtonElement>(null);

  // Move focus into the fallback so keyboard and screen-reader users land
  // on the way out instead of on a dead canvas.
  useEffect(() => {
    primaryRef.current?.focus({ preventScroll: true });
  }, []);

  const firstPrimary = actions.findIndex((a) => a.primary);
  const focusIndex = firstPrimary >= 0 ? firstPrimary : 0;

  // Modal fallbacks keep Tab inside the card, so focus cannot wander to the
  // broken page behind it.
  const trapTab = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!isModal || event.key !== "Tab") return;
    const buttons = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>("button"),
    );
    if (buttons.length === 0) return;
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    const active = document.activeElement;
    const inside = buttons.includes(active as HTMLButtonElement);
    if (event.shiftKey && (active === first || !inside)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !inside)) {
      event.preventDefault();
      first.focus();
    }
  };

  const card = (
    <div
      className="tt-crash-card"
      style={cardStyle(variant)}
      role={variant === "screen" ? "alertdialog" : "alert"}
      aria-modal={isModal ? true : undefined}
      onKeyDown={trapTab}
      aria-labelledby={titleId}
      aria-describedby={bodyId}
    >
      <style>{PANEL_CSS}</style>
      <img
        className="tt-crash-cat"
        src="/mascots/actions/napping.webp"
        alt=""
        aria-hidden="true"
        width={112}
        height={112}
        draggable={false}
        onError={(event) => {
          event.currentTarget.style.display = "none";
        }}
        style={{ display: "block", margin: "-8px auto 8px", width: 112, height: 112, objectFit: "contain" }}
      />
      <h2
        id={titleId}
        style={{
          margin: 0,
          // eslint-disable-next-line tt/no-raw-font -- the fallback renders with no providers or global styles (F9)
          fontFamily: FONT_DISPLAY,
          fontWeight: 400,
          fontSize: 30,
          lineHeight: 1.05,
          letterSpacing: "0.02em",
          color: NIGHT.cream,
          textShadow: `0 3px 0 ${NIGHT.outline}`,
        }}
      >
        {FALLBACK_COPY.title}{" "}
        <span style={{ color: NIGHT.coin }}>{FALLBACK_COPY.reassurance}</span>
      </h2>
      <p
        id={bodyId}
        style={{ margin: "12px 0 20px", fontSize: 15, lineHeight: 1.45, color: NIGHT.lavender }}
      >
        {body}
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
        {actions.map((action, index) => (
          <button
            key={action.label}
            ref={index === focusIndex ? primaryRef : undefined}
            type="button"
            className="tt-crash-btn"
            data-testid={action.testId}
            style={buttonStyle(!!action.primary)}
            onClick={action.onClick}
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div
      data-testid={testId}
      data-crash-fallback={variant}
      style={variant === "screen" ? screenStyle(zIndex) : inlineStyle}
    >
      {card}
    </div>
  );
};
