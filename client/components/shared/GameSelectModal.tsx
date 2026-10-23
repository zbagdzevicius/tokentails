import { PixelButton } from "./PixelButton";
import { BADCAT_PATH, BADCAT_PREVIEW, BADCAT_TITLE, badcatEntryEnabled, badcatHref } from "@/components/badcat/entry";
import {
  FORMULA_MEOW_PATH,
  FORMULA_MEOW_PICKER_DESCRIPTION,
  FORMULA_MEOW_PREVIEW,
  FORMULA_MEOW_TITLE,
  formulaMeowEntryEnabled,
  formulaMeowHref,
} from "@/components/formula-meow/entry";
import {
  ULTRA_CAT_PATH,
  ULTRA_CAT_PICKER_DESCRIPTION,
  ULTRA_CAT_PREVIEW,
  ULTRA_CAT_TITLE,
  ultraCatEntryEnabled,
  ultraCatHref,
} from "@/components/ultra-cat/entry";
import {
  MEOW_RUN_PATH,
  MEOW_RUN_PICKER_DESCRIPTION,
  MEOW_RUN_PREVIEW,
  MEOW_RUN_TITLE,
  meowRunEntryEnabled,
  meowRunHref,
} from "@/components/meow-run/entry";
import { RAVE_PATH, RAVE_PICKER_DESCRIPTION, RAVE_PREVIEW, RAVE_TITLE, raveEntryEnabled, raveHref } from "@/components/rave/entry";
import { CatnipIcon } from "@/components/shared/CatnipIcon";
import { PixelIcon } from "@/components/shared/PixelIcon";
import { isCupidSeason } from "@/components/game/seasons";
import { isAppBuild } from "@/components/claims/build";
import { pawlegendsPickerEnabled } from "@/components/pawlegends/flags";
import { PAWLEGENDS_TITLE } from "@/components/pawlegends/title";
import { swordcatPickerEnabled } from "@/components/swordcat/flags";
import { SWORDCAT_TITLE } from "@/components/swordcat/title";
import { GameModal } from "@/components/ui/GameModal";
import { GameType } from "@/models/game";
import { cdnFile } from "@/constants/utils";
import clsx from "clsx";
import { useState, type MouseEvent, type ReactNode } from "react";

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

/** Where the Pawlegends card goes: its host page, by a full page load (POC.md §11.4; web builds only). */
export const PAWLEGENDS_PICKER_HREF = "/pawlegends";
/** The Pawlegends card's key: `GameType.PAWLEGENDS` is the save type, the card itself is a link. */
export const PAWLEGENDS_CARD_KEY = "PAWLEGENDS";
/** The Pawlegends card's line: what the game is (both sides are playable, the other five heroes are bots). */
export const PAWLEGENDS_PICKER_DESCRIPTION = "Cats vs dogs: 3v3 hero battles against bots";
/**
 * The Pawlegends card art: a teamfight from a real seeded match (take X14 of the launch trailer, master frame f1232),
 * rendered in-engine by the game's own renderer after the per-skill animation upgrade: the trailer's wide brawl (shot
 * S28, the ults Curtains Up, Tangled Lights and Champion's Challenge), a red skill ring and a light pillar over the
 * heroes, the dog minions' cart on the left. Cropped to the card's 312x218 box as one 2x file (624x436, about
 * 31 KB), like the Swordcat, Bad Cat and Moon Rave cards (a 1x/2x `srcSet` kept the 1x file on 2x screens in
 * testing). Served from client/public. The "3v3 cats vs dogs" tile stays as the fallback if the file cannot load.
 */
export const PAWLEGENDS_PREVIEW = Object.freeze({
  src: "/game-select/pawlegends-preview@2x.webp",
  width: 312,
  height: 218,
  alt: "Cat and dog heroes clash in a teamfight inside a glowing red skill ring under a pillar of light",
});

/**
 * The Swordcat card art: Clem, the game's knight (ivory fur, crimson eyes, pink bow, sword, armour and red cape), a
 * frame of the game's own trailer footage cropped to the card's 312x218 box. One 2x file (624x436, about 30 KB),
 * drawn in the 312x218 box: with a 1x/2x `srcSet`, Chromium kept the 1x file for this card on 2x screens in testing.
 * Served from client/public (not the CDN). It replaced an inline pixel cat with the Token Tails ":3" coin, which is
 * the brand mark, not the game's hero.
 */
export const SWORDCAT_PREVIEW = Object.freeze({
  src: "/game-select/swordcat-preview@2x.webp",
  width: 312,
  height: 218,
});

/** The Moon Rave card's key: a free string, not a GameType (the rave is a page, not a Phaser mode). */
export const RAVE_CARD_KEY = "RAVE";

/** The Formula Meow card's key: a free string, not a GameType (the kart game saves no scores). */
export const FORMULA_MEOW_CARD_KEY = "FORMULA_MEOW";

/** The Ultra Cat card's key: a free string, not a GameType (the kaiju game saves no scores). */
export const ULTRA_CAT_CARD_KEY = "ULTRA_CAT";

/** The Meow Run card's key: a free string, not a GameType (the 3D story runner saves no scores). */
export const MEOW_RUN_CARD_KEY = "MEOW_RUN";

/** The Bad Cat Daily card's key: a free string, not a GameType (its runs save as `BAD_CAT` from the game). */
export const BADCAT_CARD_KEY = "BADCAT";
/** The Bad Cat card's line: the game's own pitch, short enough for the phone column. */
export const BADCAT_PICKER_DESCRIPTION = "Be the cat: wreck the room, don't get caught";

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
  previewVariant: "IMAGE" | "MATCH3" | "HEIST" | "SWORDCAT" | "BADCAT" | "RAVE" | "PAWLEGENDS" | "FORMULA_MEOW" | "ULTRA_CAT" | "MEOW_RUN";
}

/**
 * A card's link: the Heist's carries `?from=picker` (it feeds `heist_open`), Bad Cat's too (`badcatHref`),
 * the Moon Rave's (`raveHref`, as the landing's `from=landing_rave`) and Pawlegends' (it feeds
 * `pawlegends_open {from}`); others go as they are.
 */
export const cardHref = (card: Pick<GameCard, "key" | "href">) => {
  if (!card.href) return undefined;
  if (card.key === GameType.CATNIP_HEIST) return heistHref(card.href);
  if (card.key === PAWLEGENDS_CARD_KEY) return heistHref(card.href);
  if (card.key === BADCAT_CARD_KEY) return badcatHref("picker");
  if (card.key === RAVE_CARD_KEY) return raveHref("picker");
  if (card.key === FORMULA_MEOW_CARD_KEY) return formulaMeowHref("picker");
  if (card.key === ULTRA_CAT_CARD_KEY) return ultraCatHref("picker");
  if (card.key === MEOW_RUN_CARD_KEY) return meowRunHref("picker");
  return card.href;
};

/** The link's test id: the Heist keeps `game-card-heist`, others are `game-card-<key>`. */
const cardTestId = (card: GameCard) =>
  card.key === GameType.CATNIP_HEIST ? "game-card-heist" : `game-card-${card.key.toLowerCase()}`;

/**
 * The picker's cards, in order. Two per row on phones; from `md` four cards share one row, five or six
 * sit three to a row (3 + 2 centred, or 3 + 3), seven or eight sit four to a row (4 + 3 centred, or 4 + 4),
 * nine sit three to a row (3 + 3 + 3; a 5 + 4 split made the descriptions too narrow to read), ten sit 4 + 3 + 3
 * (a grid of eight half-card columns, the rows of three centred; 5 + 5 is too narrow and 4 + 4 + 2 left a gap),
 * and eleven sit four to a row (4 + 4 + 3 centred). The Moon Rave comes
 * first (founder, Oct 18: the rave is the priority, as on the landing), when `includeRave` is set
 * (`raveEntryEnabled()`: every web build, no flag; never the app build). Pawlegends, the new flagship, comes
 * right after the Moon Rave with the same NEW badge, only when `includePawlegends` is set
 * (`pawlegendsPickerEnabled()`: web builds only, the env flags are kill switches). Cupid Cat is seasonal
 * (January to March, `components/game/seasons`): outside the season it is left out. The Swordcat card
 * (`SWORDCAT_TITLE`) comes after the Heist, only when `includeSwordcat` is set (`swordcatPickerEnabled()`: on
 * by default, the env flags are kill switches). Bad Cat Daily comes next, when `includeBadcat` is set
 * (`badcatEntryEnabled()`: every web build, no flag; never the app build). Formula Meow (`/meow-race`) follows
 * Bad Cat, when `includeFormulaMeow` is set (`formulaMeowEntryEnabled()`: every web build, no flag; never the
 * app build). Ultra Cat (`/ultra-cat`) follows, when `includeUltraCat` is set (`ultraCatEntryEnabled()`:
 * every web build, no flag; never the app build). Meow Run (`/meow-run`, the 3D story runner; Purrsuit is the
 * classic 2D one) comes last, when `includeMeowRun` is set (`meowRunEntryEnabled()`: every web build, no flag;
 * never the app build). Web builds show ten cards outside the Cupid season and eleven in it.
 */
export function gameCards(
  includeHeist: boolean,
  now: Date = new Date(),
  includeSwordcat = false,
  includeBadcat = false,
  includeRave = false,
  includePawlegends = false,
  includeFormulaMeow = false,
  includeUltraCat = false,
  includeMeowRun = false
): GameCard[] {
  const cards: GameCard[] = [];
  if (includeRave) {
    cards.push({
      key: RAVE_CARD_KEY,
      href: RAVE_PATH,
      title: RAVE_TITLE.toUpperCase(),
      description: RAVE_PICKER_DESCRIPTION,
      badge: "NEW",
      image: RAVE_PREVIEW.src,
      previewVariant: "RAVE",
    });
  }
  // The new flagship sits right after the Moon Rave (founder, Oct 18: the rave stays first), ahead of the classics.
  if (includePawlegends) {
    cards.push({
      key: PAWLEGENDS_CARD_KEY,
      href: PAWLEGENDS_PICKER_HREF,
      title: PAWLEGENDS_TITLE.toUpperCase(),
      description: PAWLEGENDS_PICKER_DESCRIPTION,
      badge: "NEW",
      image: PAWLEGENDS_PREVIEW.src,
      previewVariant: "PAWLEGENDS",
    });
  }
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
      image: SWORDCAT_PREVIEW.src,
      previewVariant: "SWORDCAT",
    });
  }
  if (includeBadcat) {
    cards.push({
      key: BADCAT_CARD_KEY,
      href: BADCAT_PATH,
      title: BADCAT_TITLE.toUpperCase(),
      description: BADCAT_PICKER_DESCRIPTION,
      badge: "NEW",
      image: BADCAT_PREVIEW.src,
      previewVariant: "BADCAT",
    });
  }
  if (includeFormulaMeow) {
    cards.push({
      key: FORMULA_MEOW_CARD_KEY,
      href: FORMULA_MEOW_PATH,
      title: FORMULA_MEOW_TITLE.toUpperCase(),
      description: FORMULA_MEOW_PICKER_DESCRIPTION,
      badge: "NEW",
      image: FORMULA_MEOW_PREVIEW.src,
      previewVariant: "FORMULA_MEOW",
    });
  }
  if (includeUltraCat) {
    cards.push({
      key: ULTRA_CAT_CARD_KEY,
      href: ULTRA_CAT_PATH,
      title: ULTRA_CAT_TITLE.toUpperCase(),
      description: ULTRA_CAT_PICKER_DESCRIPTION,
      badge: "NEW",
      image: ULTRA_CAT_PREVIEW.src,
      previewVariant: "ULTRA_CAT",
    });
  }
  if (includeMeowRun) {
    cards.push({
      key: MEOW_RUN_CARD_KEY,
      href: MEOW_RUN_PATH,
      title: MEOW_RUN_TITLE.toUpperCase(),
      description: MEOW_RUN_PICKER_DESCRIPTION,
      badge: "NEW",
      image: MEOW_RUN_PREVIEW.src,
      previewVariant: "MEOW_RUN",
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

const SwordcatPreview = () => (
  <span className="relative block aspect-[312/218] h-full overflow-hidden rounded-lg border-[3px] border-tt-night-950 bg-tt-night-900 shadow-[inset_0_0_0_2px_rgb(var(--tt-gold-400)/0.55)]">
    <img
      src={SWORDCAT_PREVIEW.src}
      width={SWORDCAT_PREVIEW.width}
      height={SWORDCAT_PREVIEW.height}
      alt=""
      draggable={false}
      decoding="async"
      data-testid="game-card-swordcat-preview"
      className="h-full w-full object-cover"
    />
  </span>
);

/** A frame of the first heist, captured from the built game (`BADCAT_PREVIEW`). */
const BadcatPreview = () => (
  <span className="relative block aspect-[312/218] h-full overflow-hidden rounded-lg border-[3px] border-tt-night-950 bg-tt-night-900 shadow-[inset_0_0_0_2px_rgb(var(--tt-gold-400)/0.55)]">
    <img
      src={BADCAT_PREVIEW.src}
      width={BADCAT_PREVIEW.width}
      height={BADCAT_PREVIEW.height}
      alt=""
      draggable={false}
      decoding="async"
      data-testid="game-card-badcat-preview"
      className="h-full w-full object-cover"
    />
  </span>
);

/** The live Moon Rave scene: the DJ cat at the booth under the green moon, the crowd dancing (`RAVE_PREVIEW`). */
const RavePreview = () => (
  <span className="relative block aspect-[312/218] h-full overflow-hidden rounded-lg border-[3px] border-tt-night-950 bg-tt-night-900 shadow-[inset_0_0_0_2px_rgb(var(--tt-gold-400)/0.55)]">
    <img
      src={RAVE_PREVIEW.src}
      width={RAVE_PREVIEW.width}
      height={RAVE_PREVIEW.height}
      alt=""
      draggable={false}
      decoding="async"
      data-testid="game-card-rave-preview"
      className="h-full w-full object-cover"
    />
  </span>
);

/** A real match frame; the "3v3 cats vs dogs" tile if the image cannot load. */
const PawlegendsPreview = () => {
  const [failed, setFailed] = useState(false);
  const frame =
    "relative flex aspect-[312/218] h-full flex-col items-center justify-center overflow-hidden rounded-lg border-[3px] border-tt-night-950 bg-gradient-to-br from-tt-night-700 to-tt-night-900 shadow-[inset_0_0_0_2px_rgb(var(--tt-gold-400)/0.55)]";
  if (!failed) {
    return (
      <span className={frame}>
        <img
          src={PAWLEGENDS_PREVIEW.src}
          width={PAWLEGENDS_PREVIEW.width}
          height={PAWLEGENDS_PREVIEW.height}
          alt={PAWLEGENDS_PREVIEW.alt}
          draggable={false}
          decoding="async"
          data-testid="game-card-pawlegends-preview"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      </span>
    );
  }
  return (
    <span data-testid="game-card-pawlegends-preview" className={frame}>
      <span aria-hidden="true" className="font-primary text-[1.4rem] leading-none text-tt-gold-400 md:text-[2rem]">
        3v3
      </span>
      <span aria-hidden="true" className="mt-1 font-secondary text-[7px] uppercase tracking-[0.12em] text-tt-cream md:text-[10px]">
        cats vs dogs
      </span>
    </span>
  );
};

/** A frame of a real race on Kitchen's loop (`FORMULA_MEOW_PREVIEW`). */
const FormulaMeowPreview = () => (
  <span className="relative block aspect-[312/218] h-full overflow-hidden rounded-lg border-[3px] border-tt-night-950 bg-tt-night-900 shadow-[inset_0_0_0_2px_rgb(var(--tt-gold-400)/0.55)]">
    <img
      src={FORMULA_MEOW_PREVIEW.src}
      width={FORMULA_MEOW_PREVIEW.width}
      height={FORMULA_MEOW_PREVIEW.height}
      alt=""
      draggable={false}
      decoding="async"
      data-testid="game-card-formula_meow-preview"
      className="h-full w-full object-cover"
    />
  </span>
);

/** A frame of a real rampage with the HUD cropped out (`ULTRA_CAT_PREVIEW`). */
const UltraCatPreview = () => (
  <span className="relative block aspect-[312/218] h-full overflow-hidden rounded-lg border-[3px] border-tt-night-950 bg-tt-night-900 shadow-[inset_0_0_0_2px_rgb(var(--tt-gold-400)/0.55)]">
    <img
      src={ULTRA_CAT_PREVIEW.src}
      width={ULTRA_CAT_PREVIEW.width}
      height={ULTRA_CAT_PREVIEW.height}
      alt={ULTRA_CAT_PREVIEW.alt}
      draggable={false}
      decoding="async"
      data-testid="game-card-ultra_cat-preview"
      className="h-full w-full object-cover"
    />
  </span>
);

/** A frame of a real run with the HUD cropped out (`MEOW_RUN_PREVIEW`). */
const MeowRunPreview = () => (
  <span className="relative block aspect-[312/218] h-full overflow-hidden rounded-lg border-[3px] border-tt-night-950 bg-tt-night-900 shadow-[inset_0_0_0_2px_rgb(var(--tt-gold-400)/0.55)]">
    <img
      src={MEOW_RUN_PREVIEW.src}
      width={MEOW_RUN_PREVIEW.width}
      height={MEOW_RUN_PREVIEW.height}
      alt={MEOW_RUN_PREVIEW.alt}
      draggable={false}
      decoding="async"
      data-testid="game-card-meow_run-preview"
      className="h-full w-full object-cover"
    />
  </span>
);

const Preview = ({ card }: { card: GameCard }) => {
  if (card.previewVariant === "RAVE") return <RavePreview />;
  if (card.previewVariant === "SWORDCAT") return <SwordcatPreview />;
  if (card.previewVariant === "PAWLEGENDS") return <PawlegendsPreview />;
  if (card.previewVariant === "BADCAT") return <BadcatPreview />;
  if (card.previewVariant === "FORMULA_MEOW") return <FormulaMeowPreview />;
  if (card.previewVariant === "ULTRA_CAT") return <UltraCatPreview />;
  if (card.previewVariant === "MEOW_RUN") return <MeowRunPreview />;
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
  /** Override `swordcatPickerEnabled()` (on by default; `NEXT_PUBLIC_SWORDCAT_PICKER=0` hides the card) (tests). */
  showSwordcat?: boolean;
  /** Override `badcatEntryEnabled()` (every web build; never the app build) (tests). */
  showBadcat?: boolean;
  /** Override `raveEntryEnabled()` (every web build; never the app build) (tests). */
  showRave?: boolean;
  /** Override `pawlegendsPickerEnabled(isAppBuild())` (on in web builds; `NEXT_PUBLIC_PAWLEGENDS_PICKER=0` hides it) (tests). */
  showPawlegends?: boolean;
  /** Override `formulaMeowEntryEnabled()` (every web build; never the app build) (tests). */
  showFormulaMeow?: boolean;
  /** Override `ultraCatEntryEnabled()` (every web build; never the app build) (tests). */
  showUltraCat?: boolean;
  /** Override `meowRunEntryEnabled()` (every web build; never the app build) (tests). */
  showMeowRun?: boolean;
  /** Full page load to the Heist. Injected by tests; defaults to `window.location.assign`. */
  navigate?: (url: string) => void;
}

/**
 * "Choose your adventure": the game picker (plan G2 layer 1, G14). Built on GameModal (`art`
 * surface): night scrim, focus trap, Esc, the game suspension, and an X on the frame's stone post.
 * Every card is one tap target (a button, or a link for the Moon Rave, Pawlegends, the Heist, Swordcat, Bad Cat
 * Daily, Formula Meow, Ultra Cat and Meow Run).
 */
export const GameSelectModal: React.FC<GameSelectModalProps> = ({
  onClose,
  setGameType,
  showHeist,
  showSwordcat,
  showBadcat,
  showRave,
  showPawlegends,
  showFormulaMeow,
  showUltraCat,
  showMeowRun,
  navigate,
}) => {
  const now = new Date();
  const cards = gameCards(
    showHeist ?? heistPickerEnabled(),
    now,
    showSwordcat ?? swordcatPickerEnabled(),
    showBadcat ?? badcatEntryEnabled(),
    showRave ?? raveEntryEnabled(),
    showPawlegends ?? pawlegendsPickerEnabled(isAppBuild()),
    showFormulaMeow ?? formulaMeowEntryEnabled(),
    showUltraCat ?? ultraCatEntryEnabled(),
    showMeowRun ?? meowRunEntryEnabled()
  );
  const cupidOpen = isCupidSeason(now);

  const pick = (card: GameCard) => (event: MouseEvent<HTMLElement>) => {
    if (card.href) {
      // Ctrl/Cmd/Shift/Alt or a middle click: let the browser open the link its own way (a new tab
      // or window), with the same `?from=picker` href.
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
      // A full load, like the landing's PLAY GAME: the Heist page (and the rave, Swordcat, Bad Cat, Pawlegends) is
      // its own app shell. On the Heist, `from` feeds `heist_open {from}` and is stripped from the
      // address bar on arrival; the rave ignores it and keeps it in the URL.
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

  // Ten (every web card outside the Cupid season): 4 + 3 + 3 from md. Equal widths in a wrapping row can only
  // give 4 + 4 + 2, so the list becomes a grid of eight half-card columns there: each card spans two, and the
  // first card of each row of three (the 5th and the 8th) starts one column in, which centres that row.
  const tenGrid = cards.length === 10;
  const cardClass = clsx(
    "flex w-[calc(50%-0.375rem)] flex-col items-center",
    // Four cards: one row. Three, five or six: three to a row (5 = 3 + 2 centred by justify-center).
    // Seven, eight or eleven: four to a row, 4 + 3 centred, 4 + 4, or 4 + 4 + 3 centred (eleven is every web
    // card in the Cupid season). Nine: three to a row, 3 + 3 + 3. Ten: the grid above.
    tenGrid
      ? "md:col-span-2 md:w-auto md:[&:nth-child(5)]:col-start-2 md:[&:nth-child(8)]:col-start-2"
      : cards.length === 4 || cards.length === 7 || cards.length === 8 || cards.length === 11
        ? "md:w-[calc(25%-0.75rem)]"
        : "md:w-[calc(33.333%-0.75rem)]",
    // Short landscape phones: five cards share one row there (a second row would sit below the fold of
    // the scrolling list). Six or more would be too narrow to read in one row (the descriptions were
    // cut off mid-word): they keep their md rows (3 + 3 up to 4 + 4 + 3) and the list scrolls.
    cards.length === 5 && "[@media(min-width:768px)_and_(max-height:520px)]:w-[calc(20%-0.8rem)]"
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
          className={clsx(
            "relative z-10 -mx-2 flex min-h-0 flex-wrap content-start justify-center gap-x-3 gap-y-3 overflow-y-auto overscroll-contain px-2 pb-1 pt-3 md:gap-x-4 md:pt-4",
            tenGrid && "md:grid md:grid-cols-8"
          )}
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
