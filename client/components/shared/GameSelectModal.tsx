import { PixelButton } from "./PixelButton";
import { CatnipIcon } from "@/components/shared/CatnipIcon";
import { PixelIcon } from "@/components/shared/PixelIcon";
import { isCupidSeason } from "@/components/game/seasons";
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
  previewVariant: "IMAGE" | "MATCH3" | "HEIST";
}

/**
 * The picker's cards, in order. Four with the Heist (2x2 on phones, one row from `md`). Cupid Cat
 * is seasonal (January to March, `components/game/seasons`): outside the season it is left out.
 */
export function gameCards(includeHeist: boolean, now: Date = new Date()): GameCard[] {
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

const Preview = ({ card }: { card: GameCard }) => {
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
  /** Full page load to the Heist. Injected by tests; defaults to `window.location.assign`. */
  navigate?: (url: string) => void;
}

/**
 * "Choose your adventure": the game picker (plan G2 layer 1, G14). Built on GameModal (`art`
 * surface): night scrim, focus trap, Esc, the game suspension, and an X on the frame's stone post.
 * Every card is one tap target (a button, or a link for the Heist).
 */
export const GameSelectModal: React.FC<GameSelectModalProps> = ({
  onClose,
  setGameType,
  showHeist,
  navigate,
}) => {
  const now = new Date();
  const cards = gameCards(showHeist ?? heistPickerEnabled(), now);
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
      go(heistHref(card.href));
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
      <span className="mt-2 whitespace-nowrap rounded-md border-[3px] border-yellow-900 bg-tt-cream px-2 py-1 font-primary text-p6 uppercase leading-none tracking-wide text-tt-gold-ink shadow-[0_3px_0_#e2c05a] group-hover:brightness-110 [@media(min-width:768px)_and_(min-height:521px)]:hidden">
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
                    href={heistHref(card.href)}
                    onClick={pick(card)}
                    aria-label={label}
                    aria-describedby={descriptionId(card)}
                    data-testid="game-card-heist"
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
