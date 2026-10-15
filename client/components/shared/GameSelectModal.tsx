import { PixelButton } from "./PixelButton";
import { CatnipIcon } from "@/components/shared/CatnipIcon";
import { PixelIcon } from "@/components/shared/PixelIcon";
import { isCupidSeason } from "@/components/game/seasons";
import { swordcatPickerEnabled } from "@/components/swordcat/flags";
import { SWORDCAT_TITLE } from "@/components/swordcat/title";
import { GameModal } from "@/components/ui/GameModal";
import { GameType } from "@/models/game";
import { cdnFile } from "@/constants/utils";
import clsx from "clsx";
import type { MouseEvent, ReactNode } from "react";

/** The Paw Match preview tile that shows the catnip sprig (CatnipIcon, plan G8). */
const CATNIP_TILE = "catnip";

/** Where the Heist card goes (plan G2 layer 1): the host page, by a full page load. */
export const HEIST_PICKER_HREF = "/heist";

/** The Heist card's link: `from=picker` feeds `heist_open {from}` on the host page. */
export const heistHref = (href: string) => `${href}?from=picker`;

/** Where the Swordcat card (`SWORDCAT_TITLE`) goes: the flagged host page, by a full page load. */
export const SWORDCAT_PICKER_HREF = "/swordcat";
/** The Swordcat card's key: a free string, not a GameType (Phase 1 saves nothing). */
export const SWORDCAT_CARD_KEY = "SWORDCAT";
/** The Swordcat card's line (plan §12.3 E): the kittens carry real Pink Paw cats' names and photos. */
export const SWORDCAT_PICKER_DESCRIPTION = "Every cat you save is a real Pink Paw cat";

/**
 * The Heist card in the picker: on by default in every build (founder, 2026-10-05, overriding
 * decision #15's Poki hold). `NEXT_PUBLIC_HEIST_PICKER=0`/`false`/`off` hides it.
 */
export function heistPickerEnabled(
  flag: string | undefined = process.env.NEXT_PUBLIC_HEIST_PICKER,
  nodeEnv: string | undefined = process.env.NODE_ENV,
  e2e: string | undefined = process.env.NEXT_PUBLIC_E2E
): boolean {
  const value = (flag || "").trim();
  if (/^(1|true|yes|on)$/i.test(value)) return true;
  if (/^(0|false|no|off)$/i.test(value)) return false;
  // On by default everywhere (founder, 2026-10-05: decision #15 overridden); the flag can still
  // turn it off. `nodeEnv` and `e2e` are kept for the call sites and tests.
  void nodeEnv;
  void e2e;
  return true;
}

export interface GameCard {
  key: string;
  title: string;
  description: string;
  /** A Phaser mode, picked in place. */
  type?: GameType;
  /** A page outside the game shell, opened with a full page load (the Heist). */
  href?: string;
  /** Gold corner badge (the Heist's "NO SIGN-UP", decision #16). */
  badge?: string;
  /** Quiet corner tag (Purrsuit's "CLASSIC", decision #94). */
  tag?: string;
  image?: string;
  previewBg?: string;
  previewVariant: "IMAGE" | "MATCH3" | "HEIST" | "SWORDCAT";
}

/** A card's link: the Heist's carries `?from=picker` (it feeds `heist_open`); others go as they are. */
export const cardHref = (card: Pick<GameCard, "key" | "href">) =>
  card.href ? (card.key === GameType.CATNIP_HEIST ? heistHref(card.href) : card.href) : undefined;

/** The link's test id: the Heist keeps `game-card-heist`, others are `game-card-<key>`. */
const cardTestId = (card: GameCard) =>
  card.key === GameType.CATNIP_HEIST ? "game-card-heist" : `game-card-${card.key.toLowerCase()}`;

/**
 * The picker's cards, in order. Four with the Heist (2x2 on phones, one row from `md`). Cupid Cat
 * is seasonal (January to March, `components/game/seasons`): outside the season it is left out.
 * The Swordcat card (`SWORDCAT_TITLE`) comes after the Heist, only when `includeSwordcat` is set
 * (`swordcatPickerEnabled()`, default off).
 */
export function gameCards(includeHeist: boolean, now: Date = new Date(), includeSwordcat = false): GameCard[] {
  const cards: GameCard[] = [];
  if (isCupidSeason(now)) {
    cards.push({
      key: GameType.PIXEL_RESCUE,
      type: GameType.PIXEL_RESCUE,
      title: "CUPID CAT",
      description: "Free a caged cat, one new cage a day",
      tag: "SEASONAL",
      image: cdnFile("utilities/game-modal/pixel-rescue.webp"),
      previewVariant: "IMAGE",
    });
  }
  cards.push(
    {
      key: GameType.CATNIP_CHAOS,
      type: GameType.CATNIP_CHAOS,
      title: "PURRSUIT",
      description: "Run, jump and dodge traps with your cat",
      // Frozen for now: no promise of new levels (decision #94, plan G14).
      tag: "CLASSIC",
      image: cdnFile("utilities/game-modal/catnip-chaos.webp"),
      previewVariant: "IMAGE",
    },
    {
      key: GameType.MATCH_3,
      type: GameType.MATCH_3,
      title: "PAW MATCH",
      description: "Match tiles, chain combos, beat the clock",
      previewBg: cdnFile("landing/game-bg-2.webp"),
      previewVariant: "MATCH3",
    },
  );
  if (includeHeist) {
    cards.push({
      key: GameType.CATNIP_HEIST,
      href: HEIST_PICKER_HREF,
      title: "CATNIP HEIST",
      description: "Sneak two cats past the guard dogs",
      badge: "NO SIGN-UP",
      // A crop of the Heist's own level 1 (not on the CDN: served from client/public).
      image: "/game-select/heist-preview.webp",
      previewVariant: "HEIST",
    });
  }
  if (includeSwordcat) {
    cards.push({
      key: SWORDCAT_CARD_KEY,
      href: SWORDCAT_PICKER_HREF,
      title: SWORDCAT_TITLE.toUpperCase(),
      description: SWORDCAT_PICKER_DESCRIPTION,
      badge: "NEW",
      previewVariant: "SWORDCAT",
    });
  }
  return cards;
}

const MATCH3_TILES = [
  cdnFile("logo/logo.webp"),
  cdnFile("logo/paw.webp"),
  cdnFile("logo/heart.webp"),
  cdnFile("ability/FIRE.png"),
  cdnFile("ability/WATER.png"),
  CATNIP_TILE,
  cdnFile("ability/NATURE.png"),
  cdnFile("logo/paw.webp"),
  cdnFile("logo/logo.webp"),
  cdnFile("logo/heart.webp"),
  cdnFile("ability/FIRE.png"),
  CATNIP_TILE,
] as const;

/** The frame art, drawn as a 9-slice so the stone corner posts stay square at any size. */
const FRAME_ART = cdnFile("catnip-chaos/modal.webp");
/** Pixels of the 727x557 art that hold a corner post plus the bars. */
const FRAME_SLICE = 62;

/**
 * The X sits on the frame's top-right stone post (plan G14): the frame border is exactly the
 * CloseButton's size (44 px, 64 px from `lg`), so the button covers the post. These variants pin
 * GameModal's X (its `outside` placement) to the content's corner, which is the frame's corner.
 */
const PIN_CLOSE_TO_POST = "[&>button[data-placement]]:!right-0 [&>button[data-placement]]:!top-0";

/** The id of a card's one-line description (the card's aria-describedby). */
const descriptionId = (card: GameCard) => `game-card-${card.key.toLowerCase()}-about`;

/**
 * The art's top-left post carries a stray "R" glyph. This tile repaints that corner with the
 * bottom-left paw post from the same 9-slice art: at the frame's border width (44 px, 64 px from
 * lg) one art slice maps to one border width, so the art is scaled by 44/62 (64/62) and pinned to
 * its bottom-left corner. The clip drops what differs between the two slices: the side bar
 * running up out of the bottom post (top 7 %) and the panel fill beside it (top-right notch).
 */
const PawPost = () => (
  <span
    aria-hidden="true"
    data-testid="game-select-paw-post"
    className="pointer-events-none absolute -left-[44px] -top-[44px] z-20 h-[44px] w-[44px] bg-no-repeat [background-position:0_100%] [background-size:515.9px_395.3px] [clip-path:polygon(0_7%,87%_7%,87%_19%,100%_19%,100%_100%,0_100%)] lg:-left-[64px] lg:-top-[64px] lg:h-[64px] lg:w-[64px] lg:[background-size:750.5px_575px]"
    style={{ backgroundImage: `url(${FRAME_ART})` }}
  />
);

/**
 * The Swordcat preview, drawn inline (no image file): Clem, the game's knight, as an ivory sitting cat with a
 * maroon outline and her pink bow on the left ear, under the Token Tails gold ":3" coin on the night sky (Token
 * Tails tokens: night #0B0820/#2A1F45, gold #FFCC55, ink #4A1D08, love pink #FF7AA2). Pink is Clem's bow alone.
 * Pixel art on a 39x27 grid, so it stays crisp at any size.
 */
const SwordcatPreview = () => (
  <span className="relative block aspect-[312/218] h-full overflow-hidden rounded-lg border-[3px] border-tt-night-950 bg-tt-night-900 shadow-[inset_0_0_0_2px_rgb(var(--tt-gold-400)/0.55)]">
    <svg
      viewBox="0 0 39 27"
      aria-hidden="true"
      focusable="false"
      data-testid="game-card-swordcat-preview"
      className="h-full w-full"
      shapeRendering="crispEdges"
    >
      {/* Night sky: deep night above, dusk night band and a dark hill below */}
      <rect width="39" height="27" fill="#0B0820" />
      <rect y="15" width="39" height="10" fill="#2A1F45" />
      <rect y="25" width="39" height="2" fill="#1E1633" />
      <rect y="25" width="39" height="1" fill="#3A2D5C" />
      {/* Stars */}
      <rect x="3" y="4" width="1" height="1" fill="#FFCC55" opacity="0.8" />
      <rect x="20" y="1" width="1" height="1" fill="#FFCC55" opacity="0.6" />
      <rect x="2" y="12" width="1" height="1" fill="#F0C5FD" opacity="0.7" />
      <rect x="36" y="17" width="1" height="1" fill="#FFCC55" opacity="0.7" />
      <rect x="24" y="10" width="1" height="1" fill="#F0C5FD" opacity="0.6" />
      {/* Clem's outline (ink): ears, head, body, curled tail */}
      <g fill="#4A1D08">
        <rect x="11" y="3" width="2" height="1" />
        <rect x="10" y="4" width="4" height="3" />
        <rect x="20" y="3" width="2" height="1" />
        <rect x="19" y="4" width="4" height="3" />
        <rect x="9" y="7" width="15" height="8" />
        <rect x="8" y="14" width="17" height="11" />
        <rect x="24" y="19" width="5" height="5" />
        <rect x="26" y="15" width="3" height="5" />
      </g>
      {/* Clem's ivory coat */}
      <g fill="#F3EEE6">
        <rect x="11" y="4" width="2" height="4" />
        <rect x="20" y="4" width="2" height="4" />
        <rect x="10" y="8" width="13" height="7" />
        <rect x="9" y="15" width="15" height="9" />
        <rect x="24" y="20" width="4" height="3" />
        <rect x="27" y="16" width="1" height="4" />
      </g>
      {/* Coat highlight, inner ear, paws */}
      <rect x="11" y="8" width="3" height="1" fill="#FFFFFF" />
      <rect x="20" y="5" width="1" height="2" fill="#FFB3C7" />
      <rect x="15" y="21" width="1" height="3" fill="#D9CFC2" />
      <rect x="11" y="23" width="3" height="1" fill="#D9CFC2" />
      <rect x="18" y="23" width="3" height="1" fill="#D9CFC2" />
      {/* Face: eyes with a catchlight, pink nose, ink mouth, blush */}
      <rect x="13" y="10" width="1" height="2" fill="#2A1F45" />
      <rect x="19" y="10" width="1" height="2" fill="#2A1F45" />
      <rect x="13" y="10" width="1" height="1" fill="#90C5E9" />
      <rect x="19" y="10" width="1" height="1" fill="#90C5E9" />
      <rect x="16" y="12" width="1" height="1" fill="#FF7AA2" />
      <rect x="15" y="13" width="1" height="1" fill="#4A1D08" />
      <rect x="17" y="13" width="1" height="1" fill="#4A1D08" />
      <rect x="11" y="12" width="1" height="1" fill="#FFB3C7" opacity="0.8" />
      <rect x="21" y="12" width="1" height="1" fill="#FFB3C7" opacity="0.8" />
      {/* Clem's pink bow on her left ear: two loops and a knot, ink outline */}
      <g fill="#4A1D08">
        <rect x="6" y="2" width="5" height="5" />
        <rect x="10" y="3" width="3" height="3" />
        <rect x="12" y="2" width="5" height="5" />
      </g>
      <rect x="7" y="3" width="3" height="3" fill="#FF7AA2" />
      <rect x="13" y="3" width="3" height="3" fill="#FF7AA2" />
      <rect x="7" y="3" width="1" height="1" fill="#FFB3C7" />
      <rect x="13" y="3" width="1" height="1" fill="#FFB3C7" />
      <rect x="11" y="4" width="1" height="1" fill="#E0567F" />
      {/* The Token Tails gold ":3" coin, ink rim, with a sparkle */}
      <g fill="#4A1D08">
        <rect x="28" y="3" width="6" height="11" />
        <rect x="27" y="4" width="8" height="9" />
        <rect x="26" y="5" width="10" height="7" />
      </g>
      <g fill="#FFCC55">
        <rect x="28" y="4" width="6" height="9" />
        <rect x="27" y="5" width="8" height="7" />
      </g>
      <rect x="28" y="12" width="6" height="1" fill="#E2C05A" />
      <rect x="34" y="9" width="1" height="3" fill="#E2C05A" />
      <rect x="28" y="5" width="1" height="2" fill="#FFF1C2" />
      <g fill="#4A1D08">
        <rect x="29" y="7" width="1" height="1" />
        <rect x="29" y="9" width="1" height="1" />
        <rect x="31" y="6" width="2" height="1" />
        <rect x="32" y="7" width="1" height="1" />
        <rect x="31" y="8" width="2" height="1" />
        <rect x="32" y="9" width="1" height="1" />
        <rect x="31" y="10" width="2" height="1" />
      </g>
      <rect x="37" y="1" width="1" height="3" fill="#FFF1C2" />
      <rect x="36" y="2" width="3" height="1" fill="#FFF1C2" />
    </svg>
  </span>
);

const Preview = ({ card }: { card: GameCard }) => {
  if (card.previewVariant === "SWORDCAT") return <SwordcatPreview />;
  if (card.previewVariant === "MATCH3") {
    return (
      <span
        className="relative block aspect-[4/3] h-full overflow-hidden rounded-lg bg-[#1d1c3a]/80 p-[3px]"
        style={
          card.previewBg
            ? { backgroundImage: `url(${card.previewBg})`, backgroundSize: "cover", backgroundPosition: "center" }
            : undefined
        }
      >
        <span className="grid h-full w-full grid-cols-4 grid-rows-3 gap-[3px] rounded-[6px] bg-[#15132a]/80 p-[3px]">
          {MATCH3_TILES.map((tileSrc, index) => (
            <span
              key={`${tileSrc}-${index}`}
              className="flex items-center justify-center rounded-[4px] border border-indigo-200/20 bg-[#2a2960]/55 shadow-inner"
            >
              {tileSrc === CATNIP_TILE ? (
                <CatnipIcon size={24} alt="" className="!h-[0.95rem] !w-[0.95rem] md:!h-5 md:!w-5" />
              ) : (
                <img
                  src={tileSrc}
                  alt=""
                  draggable={false}
                  className="h-[0.95rem] w-[0.95rem] object-contain md:h-5 md:w-5"
                  style={{ imageRendering: "pixelated" }}
                />
              )}
            </span>
          ))}
        </span>
        <span className="pointer-events-none absolute -right-1 bottom-1 rounded-md border border-yellow-100/65 bg-pink-600/80 px-1.5 py-[1px] font-secondary text-[7px] uppercase tracking-[0.12em] text-yellow-50 md:text-[10px]">
          combo
        </span>
      </span>
    );
  }
  if (card.previewVariant === "HEIST") {
    return (
      <span className="relative block aspect-[312/218] h-full overflow-hidden rounded-lg border-[3px] border-tt-night-950 bg-tt-night-900 shadow-[inset_0_0_0_2px_rgb(var(--tt-gold-400)/0.55)]">
        <img
          src={card.image}
          alt=""
          draggable={false}
          className="h-full w-full object-cover"
          style={{ imageRendering: "pixelated" }}
        />
      </span>
    );
  }
  return <img src={card.image} alt="" draggable={false} className="max-h-full max-w-full object-contain" />;
};

interface GameSelectModalProps {
  onClose: () => void;
  setGameType: (gameType: GameType) => void;
  /** Override the `NEXT_PUBLIC_HEIST_PICKER` flag (tests). */
  showHeist?: boolean;
  /** Override the `NEXT_PUBLIC_SWORDCAT_PICKER` flag set (tests). */
  showSwordcat?: boolean;
  /** Full page load to the Heist. Injected by tests; defaults to `window.location.assign`. */
  navigate?: (url: string) => void;
}

/**
 * "Choose your adventure": the game picker (plan G2 layer 1, G14). Built on GameModal (`art`
 * surface): night scrim, focus trap, Esc, the game suspension, and an X on the frame's stone post.
 * Every card is one tap target (a button, or a link for the Heist and Swordcat).
 */
export const GameSelectModal: React.FC<GameSelectModalProps> = ({
  onClose,
  setGameType,
  showHeist,
  showSwordcat,
  navigate,
}) => {
  const now = new Date();
  const cards = gameCards(showHeist ?? heistPickerEnabled(), now, showSwordcat ?? swordcatPickerEnabled());
  const cupidOpen = isCupidSeason(now);

  const pick = (card: GameCard) => (event: MouseEvent<HTMLElement>) => {
    if (card.href) {
      // Ctrl/Cmd/Shift/Alt or a middle click: let the browser open the link its own way (a new tab
      // or window), with the same `?from=picker` href.
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
      // A full load, like the landing's PLAY GAME: the Heist page is its own app shell. `from`
      // feeds `heist_open {from}` there and is stripped from the address bar on arrival.
      event.preventDefault();
      const go = navigate ?? ((url: string) => window.location.assign(url));
      go(cardHref(card) ?? card.href);
      return;
    }
    if (card.type) {
      setGameType(card.type);
      onClose();
    }
  };

  const cardBody = (card: GameCard): ReactNode => (
    <>
      <span className="relative flex h-[4.75rem] w-full items-center justify-center md:h-[7rem] [@media(max-height:520px)]:h-[4.5rem]">
        <Preview card={card} />
        {card.badge && (
          <span className="pointer-events-none absolute -top-2 right-0 z-10 rounded-[4px] border-2 border-tt-night-950 bg-tt-gold-400 px-1.5 py-[2px] font-primary text-[0.6rem] leading-none tracking-wide text-tt-gold-ink shadow-[0_2px_0_rgb(var(--tt-night-950))] md:-right-1 md:text-[0.7rem]">
            {card.badge}
          </span>
        )}
        {card.tag && (
          <span className="pointer-events-none absolute -top-2 left-0 z-10 rounded-[4px] border-2 border-tt-night-950 bg-tt-night-700 px-1.5 py-[2px] font-primary text-[0.6rem] leading-none tracking-wide text-tt-cream shadow-[0_2px_0_rgb(var(--tt-night-950))] md:-left-1 md:text-[0.7rem]">
            {card.tag}
          </span>
        )}
      </span>
      {/* Phones (and short landscape screens, where four cards share a narrow frame) get a compact
          label at its real size: no transform shrink, so no dead layout box under it. The pixel
          button only where it fits (md and up, at least 521 px tall). */}
      <span
        className={clsx(
          // Long titles (Swordcat's) wrap on the narrow phone column instead of overflowing it.
          card.title.length > 12 ? "max-w-full text-balance text-center" : "whitespace-nowrap",
          "mt-2 rounded-md border-[3px] border-yellow-900 bg-tt-cream px-2 py-1 font-primary text-p6 uppercase leading-none tracking-wide text-tt-gold-ink shadow-[0_3px_0_#e2c05a] group-hover:brightness-110 [@media(min-width:768px)_and_(min-height:521px)]:hidden"
        )}
      >
        {card.title}
      </span>
      <PixelButton
        as="span"
        text={card.title}
        className="!hidden group-hover:brightness-125 [@media(min-width:768px)_and_(min-height:521px)]:mt-2 [@media(min-width:768px)_and_(min-height:521px)]:!flex lg:scale-110"
      />
      {/* What the game is, on every phone too (it used to be desktop only): Nunito on a night
          plate, so it reads over the pink clouds. Compact on short landscape screens. */}
      <span
        id={descriptionId(card)}
        className="mt-2 flex min-h-[3.25rem] w-full flex-1 items-center justify-center bg-tt-night-900/85 px-2 py-1 text-center font-sans text-[length:max(12px,0.75rem)] font-bold leading-snug text-tt-cream text-balance [box-shadow:0_0_0_2px_rgb(var(--tt-night-950)/0.6)] md:min-h-[2.9rem] md:text-[0.8125rem] lg:text-p5 [@media(max-height:520px)]:!mt-1 [@media(max-height:520px)]:!min-h-0 [@media(max-height:520px)]:!py-0.5 [@media(max-height:520px)]:!text-[12px]"
      >
        {card.description}
      </span>
    </>
  );

  const cardClass = clsx(
    "flex w-[calc(50%-0.375rem)] flex-col items-center",
    cards.length > 3 ? "md:w-[calc(25%-0.75rem)]" : "md:w-[calc(33.333%-0.75rem)]"
  );
  const targetClass =
    "group flex h-full w-full flex-col items-center rounded-lg pb-1 outline-none transition-[filter] duration-200 hover:brightness-110 focus-visible:ring-4 focus-visible:ring-tt-gold-400 focus-visible:ring-offset-2 focus-visible:ring-offset-tt-night-900";

  return (
    <GameModal
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Choose your adventure"
      surface="art"
      size="xl"
      name="game-select"
      className={clsx(
        "!max-w-[25rem] md:!max-w-[50rem] lg:!max-w-[54rem]",
        // Short landscape phones: the frame is nearly full width there, so its top-right post (the
        // X) would land on the lobby's ABOUT ME button (fixed, top right, 5rem + 1rem margin).
        // Leave that column clear on both sides so the dialog stays centred.
        "[@media(max-height:520px)]:!max-w-[min(50rem,calc(100vw-13rem))]",
        "max-h-[min(100%,44rem)]",
        PIN_CLOSE_TO_POST
      )}
      bodyClassName="flex min-h-0"
    >
      <div
        data-testid="game-select-frame"
        className="relative flex max-h-full min-h-0 w-full flex-col border-[44px] border-solid lg:border-[64px]"
        style={{
          borderImageSource: `url(${FRAME_ART})`,
          borderImageSlice: `${FRAME_SLICE} fill`,
          borderImageWidth: 1,
          borderImageRepeat: "stretch",
        }}
      >
        <PawPost />
        <img
          src="/mascots/actions/play_games.webp"
          alt=""
          aria-hidden="true"
          draggable={false}
          className="pointer-events-none absolute -left-[5.5rem] top-1/2 hidden w-24 -translate-y-1/2 -rotate-12 select-none drop-shadow-xl lg:block"
        />
        <img
          src="/mascots/emotions/playful_meow.webp"
          alt=""
          aria-hidden="true"
          draggable={false}
          className="pointer-events-none absolute -right-[5.5rem] top-1/2 hidden w-24 -translate-y-1/2 rotate-12 select-none drop-shadow-xl lg:block"
        />
        <img
          src={cdnFile("catnip-chaos/banner.webp")}
          alt=""
          aria-hidden="true"
          draggable={false}
          width={1024}
          height={320}
          // Sized before it loads (1024x320), so the dialog does not jump when the art arrives.
          className="pointer-events-none relative z-10 mx-auto -mt-7 aspect-[1024/320] h-auto w-[min(100%,24rem)] shrink-0 select-none object-contain md:-mt-9 md:w-[min(100%,30rem)] lg:-mt-12 [@media(max-height:520px)]:-mt-6 [@media(max-height:520px)]:w-[min(100%,15rem)]"
        />
        <ul
          className="relative z-10 -mx-2 flex min-h-0 flex-wrap content-start justify-center gap-x-3 gap-y-3 overflow-y-auto overscroll-contain px-2 pb-1 pt-3 md:gap-x-4 md:pt-4"
          data-testid="game-select-cards"
        >
          {cards.map((card) => {
            const label = [card.title, card.badge, card.tag].filter(Boolean).join(" · ");
            return (
              <li key={card.key} className={cardClass} data-card={card.key}>
                {card.href ? (
                  <a
                    href={cardHref(card)}
                    onClick={pick(card)}
                    aria-label={label}
                    aria-describedby={descriptionId(card)}
                    data-testid={cardTestId(card)}
                    className={targetClass}
                  >
                    {cardBody(card)}
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={pick(card)}
                    aria-label={label}
                    aria-describedby={descriptionId(card)}
                    className={targetClass}
                  >
                    {cardBody(card)}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        {!cupidOpen && (
          <p
            data-testid="game-select-season-note"
            // Short landscape screens keep it too (one compact line): without it Cupid Cat just
            // vanishes from the picker with no reason given.
            className="relative z-10 mx-auto mt-2 flex w-fit max-w-full items-center gap-1.5 bg-tt-night-900/85 px-2.5 py-1 text-center font-sans text-[length:max(12px,0.75rem)] font-bold leading-snug text-tt-cream [box-shadow:0_0_0_2px_rgb(var(--tt-night-950)/0.6)] md:text-[0.8125rem] lg:text-p5 [@media(max-height:520px)]:!mt-1 [@media(max-height:520px)]:!py-0.5 [@media(max-height:520px)]:!text-[12px]"
          >
            <span aria-hidden="true" className="text-tt-pink">
              <PixelIcon name="heart" size={14} />
            </span>
            Cupid Cat is back every January to March.
          </p>
        )}
      </div>
    </GameModal>
  );
};
