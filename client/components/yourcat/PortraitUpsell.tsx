import { analytics } from "@/analytics";
import { buildGrowthEvent } from "@/analytics/growth-events";
import { YOURCAT_API, YourcatRequestError } from "@/api/yourcat-api";
import { trackEvent } from "@/components/GoogleTagManager";
import type { YourcatPortraitStyle, YourcatStatusView, YourcatView } from "@/models/yourcat";
import { useRef, useState, type CSSProperties } from "react";
import { BODY, CAPTION, Headline, PANEL, PrimaryAction } from "./brand";
import { ERROR_TEXT, formatPrice, PORTRAIT_STYLES, S3, S5 } from "./copy";
import { Frame } from "./Frame";
import { useInView } from "./motion";
import { framePosition, SHEET } from "./spriteSheet";
import { ALERT } from "./ui";

/** The large example at native 2:3 (phones / md+) inside an 8 px cream mat (polish spec S5). */
export const UPSELL_EXAMPLE = Object.freeze({ w: 160, h: 240, mdW: 240, mdH: 360, mat: 8 });
/** The small gold frame around the visitor's pixel avatar (96 px inner: 1 px per avatar cell). */
export const UPSELL_AVATAR = 96;
export const UPSELL_FADE_MS = 220;

export interface PortraitUpsellProps {
  record: YourcatView;
  name: string;
  portrait: YourcatStatusView["portrait"];
  /** 409 PORTRAIT_EXISTS: the page reloads the record and shows that order's state. */
  onExists: () => void;
  /** Navigates to Stripe Checkout (window.location.assign in the page). */
  navigate?: (url: string) => void;
  reducedMotion?: boolean;
}

/** The visitor's pixel avatar (768 px, 96 cells) at 96 px, or idle frame 0 of its sprite at 2x. */
function AvatarThumb({ record, alt }: { record: YourcatView; alt: string }) {
  const avatar = record.avatar.status === "ready" ? record.avatar.url : null;
  if (avatar) {
    return (
      <img
        src={avatar}
        alt={alt}
        width={UPSELL_AVATAR}
        height={UPSELL_AVATAR}
        className="pixelated block h-full w-full [image-rendering:pixelated]"
        loading="lazy"
        decoding="async"
        data-testid="yourcat-upsell-avatar"
      />
    );
  }
  const style: CSSProperties = {
    width: UPSELL_AVATAR,
    height: UPSELL_AVATAR,
    backgroundImage: `url("${record.cat.spriteImg}")`,
    backgroundSize: `${SHEET.width * 2}px ${SHEET.height * 2}px`,
    backgroundPosition: framePosition("idle", 0, 2),
    backgroundRepeat: "no-repeat",
    imageRendering: "pixelated",
  };
  return <div role="img" aria-label={alt} className="pixelated" style={style} data-testid="yourcat-upsell-avatar" />;
}

/**
 * S5 "Hang the real painting" (docs/plans/yourcat-polish.md S5): web only, after the S3 footer line
 * with a 96 px gap, never next to Share or the Pink Paw block. A panel that rises in once on view:
 * the centred H2, the strip (pixel avatar in a small gold frame, the arrow, the chosen style's example
 * in a large gilt frame at native 2:3), four 2:3 style thumbnails, the body, the one primary action
 * with the price from `GET /yourcat/status`, and the fine print. Nothing is painted before payment
 * and there is no urgency. Reduced motion: a static strip, instant swaps.
 */
export function PortraitUpsell({ record, name, portrait, onExists, navigate, reducedMotion = false }: PortraitUpsellProps) {
  const [style, setStyle] = useState<YourcatPortraitStyle>(
    (portrait.styles.find((value) => PORTRAIT_STYLES.some((item) => item.id === value)) as YourcatPortraitStyle) || "highness",
  );
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheen, setSheen] = useState(0);
  const sectionRef = useRef<HTMLElement | null>(null);
  const inView = useInView(sectionRef, { once: true });
  const price = formatPrice(portrait.priceCents, portrait.currency);
  const styles = PORTRAIT_STYLES.filter((item) => portrait.styles.length === 0 || portrait.styles.includes(item.id));
  const current = styles.find((item) => item.id === style) ?? styles[0];

  const checkout = async () => {
    setOpening(true);
    setError(null);
    try {
      const view = await YOURCAT_API.portraitCheckout(record.id, style);
      analytics.track(
        buildGrowthEvent("portrait_checkout_started", {
          surface: "yourcat",
          style,
          priceCents: portrait.priceCents,
          currency: portrait.currency,
        }),
      );
      trackEvent("begin_checkout", {
        currency: portrait.currency,
        value: portrait.priceCents / 100,
        item_name: "HD portrait",
        item_id: `portrait-digital-${style}`,
      });
      (navigate ?? ((url: string) => window.location.assign(url)))(view.checkoutUrl);
    } catch (caught) {
      setOpening(false);
      const code = caught instanceof YourcatRequestError ? caught.code : null;
      if (code === "YOURCAT_PORTRAIT_EXISTS") {
        setError(S5.exists);
        onExists();
      } else if (code === "YOURCAT_PHOTO_EXPIRED") setError(S5.photoExpired);
      else if (code === "YOURCAT_PORTRAIT_DISABLED") setError(S5.unavailable);
      else if (caught instanceof YourcatRequestError && caught.kind === "rate-limited") setError(ERROR_TEXT.burst);
      else setError(ERROR_TEXT.generic);
    }
  };

  // The large frame's sheen runs once per hover or focus of the action (never under reduced motion).
  const runSheen = () => {
    if (!reducedMotion) setSheen((count) => count + 1);
  };

  const fade = reducedMotion ? undefined : { transition: `opacity ${UPSELL_FADE_MS}ms ease-out` };

  return (
    <section
      ref={sectionRef}
      aria-labelledby="yourcat-upsell-title"
      className={`${PANEL} mx-auto mt-24 flex max-w-3xl flex-col items-center gap-5 text-center ${inView ? "yc-rise" : "opacity-0"}`}
      style={{ "--yc-dur": "360ms" } as CSSProperties}
      data-testid="yourcat-upsell"
      data-in-view={inView ? "true" : "false"}
    >
      <div id="yourcat-upsell-title" className="w-full">
        <Headline level={2} parts={S5.titleParts(name)} />
      </div>

      {/* The strip: your pixel cat -> the painting. Column on phones (it would not fit across), row on md+. */}
      <div className="flex flex-col items-center gap-2 md:flex-row md:items-center md:gap-6" data-testid="yourcat-upsell-strip">
        <Frame inner={{ w: UPSELL_AVATAR, h: UPSELL_AVATAR }} reducedMotion={reducedMotion}>
          <AvatarThumb record={record} alt={S3.frameLabel(name, record.familyLabel)} />
        </Frame>
        <img
          src="/logo/arrow.webp"
          alt=""
          aria-hidden="true"
          width={40}
          height={34}
          className="h-[34px] w-10 rotate-180 object-contain md:rotate-90"
          loading="lazy"
          decoding="async"
        />
        <Frame
          inner={{
            w: UPSELL_EXAMPLE.w + 2 * UPSELL_EXAMPLE.mat,
            h: UPSELL_EXAMPLE.h + 2 * UPSELL_EXAMPLE.mat,
            mdW: UPSELL_EXAMPLE.mdW + 2 * UPSELL_EXAMPLE.mat,
            mdH: UPSELL_EXAMPLE.mdH + 2 * UPSELL_EXAMPLE.mat,
          }}
          reducedMotion={reducedMotion}
        >
          <div className="absolute inset-0 bg-tt-cream p-2" data-testid="yourcat-upsell-example">
            <div className="relative h-full w-full overflow-hidden">
              {styles.map((item) => (
                <img
                  key={item.id}
                  src={item.image}
                  alt={item.id === current?.id ? S5.styleAlt(item.label) : ""}
                  aria-hidden={item.id === current?.id ? undefined : true}
                  data-style={item.id}
                  data-current={item.id === current?.id ? "true" : "false"}
                  className={`absolute inset-0 h-full w-full object-cover ${item.id === current?.id ? "opacity-100" : "opacity-0"}`}
                  style={fade}
                  loading="lazy"
                  decoding="async"
                />
              ))}
              {sheen > 0 && !reducedMotion && (
                <span key={sheen} aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden" data-testid="yourcat-upsell-sheen">
                  <span className="yc-sheen-once absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-white/35 to-transparent" />
                </span>
              )}
            </div>
          </div>
        </Frame>
      </div>

      <fieldset className="w-full">
        <legend className={`${BODY} mb-3 w-full text-center`}>{S5.legend}</legend>
        <div role="radiogroup" aria-label={S5.legend} className="mx-auto grid max-w-[216px] grid-cols-2 gap-3 md:max-w-xl md:grid-cols-4">
          {styles.map((item) => {
            const checked = item.id === style;
            return (
              <label
                key={item.id}
                data-testid="yourcat-upsell-style"
                className={`flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 p-1.5 text-p6 md:text-p5 text-tt-cream focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-tt-cream ${
                  checked ? "border-tt-gold-400 bg-tt-night-700/90" : "border-tt-cream/30 bg-tt-night-900/70 hover:border-tt-gold-400/60"
                }`}
              >
                <input
                  type="radio"
                  name="yourcat-portrait-style"
                  value={item.id}
                  checked={checked}
                  onChange={() => setStyle(item.id)}
                  className="sr-only"
                />
                {/* The label names the radio; the large frame carries the example's alt text. */}
                <img
                  src={item.image}
                  alt=""
                  className="aspect-[2/3] w-full rounded-lg object-cover"
                  width={200}
                  height={300}
                  loading="lazy"
                  decoding="async"
                />
                <span className="font-primary uppercase tracking-wide">{item.label}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <p className={`${BODY} max-w-xl`}>{S5.body(name, price)}</p>

      <div className="w-full" onPointerEnter={runSheen} onFocus={runSheen} data-testid="yourcat-upsell-cta">
        {/* The long label with the price would overflow a phone at the button's 1.25x scale: phones keep it at 1x. */}
        <PrimaryAction
          text={opening ? S5.opening : S5.button(price)}
          busy={opening}
          onClick={() => void checkout()}
          className="max-md:[&_button]:!scale-100 max-md:[&_button:hover]:!scale-105"
        />
      </div>
      {error && (
        <p className={`${ALERT} w-full max-w-xl`} role="alert">
          {error}
        </p>
      )}
      <p className={`${CAPTION} max-w-xl`}>{S5.finePrint}</p>
    </section>
  );
}
