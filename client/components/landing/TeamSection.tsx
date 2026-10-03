import { PixelButton } from "@/components/shared/PixelButton";
import { cdnFile } from "@/constants/utils";
import { GOLD, NIGHT, STATES } from "@/design/tokens";
import {
  CSSProperties,
  KeyboardEvent,
  PointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { landingCtaHref } from "./landingCta";
import { ITeamMember, SocialImages, teamMembers } from "./Team";

type Guild = "BUILD" | "GROWTH" | "LEGAL" | "MORALE";

const GUILD_META: Record<Guild, { label: string; color: string; icon: string }> =
  {
    BUILD: {
      label: "Build",
      color: GOLD[400],
      icon: cdnFile("cards/icons/electric.webp"),
    },
    GROWTH: {
      label: "Growth",
      color: STATES.mint,
      icon: cdnFile("cards/icons/grass.webp"),
    },
    LEGAL: {
      label: "Legal",
      color: STATES.sky,
      icon: cdnFile("cards/icons/ice.webp"),
    },
    MORALE: {
      label: "Morale",
      color: "#f59bd0", // guild pink, lighter than STATES.pink for the photo ring
      icon: cdnFile("cards/icons/fairy.webp"),
    },
  };

const GUILD_ORDER: Guild[] = ["BUILD", "GROWTH", "LEGAL", "MORALE"];

interface IStatBar {
  label: string;
  value: number | "∞";
}

interface ITeamExtra {
  guild: Guild;
  quest: string;
  bars?: IStatBar[];
  /** Extra classes for the photo, e.g. to crop a ring baked into the source image. */
  imgClass?: string;
}

// Presentation-only data for the homepage, keyed by the member name in Team.tsx.
export const TEAM_EXTRAS: Record<string, ITeamExtra> = {
  Žygimantas: {
    guild: "BUILD",
    quest:
      "Party leader. Leads product and engineering across web, iOS and Android.",
    // The source photo has a neon ring baked in; zoom past it so it doesn't double our frame.
    imgClass: "scale-[1.85] origin-[42%_40%]",
  },
  Arturas: {
    guild: "BUILD",
    quest: "Builds the AI behind the cat avatars.",
    imgClass: "scale-[1.2] origin-[50%_30%]",
  },
  Ernest: {
    guild: "BUILD",
    quest: "Leads the game: the mini-games that turn play into rescues.",
    // Source is a small figure in a wide landscape; crop to head and shoulders like the rest.
    imgClass: "scale-[1.8] origin-[48%_42%]",
  },
  Lukas: { guild: "BUILD", quest: "Leads the web app you are on right now." },
  Domas: { guild: "BUILD", quest: "Draws the pixel worlds and their cats." },
  "Sky Wee": {
    guild: "GROWTH",
    quest: "Business development: partners, shelters and investors.",
    imgClass: "scale-[1.3] origin-[50%_35%]",
  },
  Igor: { guild: "GROWTH", quest: "Marketing: grows the cat-lover community." },
  Marcin: { guild: "LEGAL", quest: "Keeps every rescue and payout by the book." },
  Feta: {
    guild: "MORALE",
    quest: "Approves every build by sitting on the keyboard.",
    bars: [
      { label: "VIBES", value: 10 },
      { label: "NAPS", value: 10 },
      { label: "KEYBOARD PRESENCE", value: 9 },
    ],
  },
  Kaciukas: {
    guild: "MORALE",
    quest: "Supervises from the warmest laptop.",
    bars: [
      { label: "NAPS", value: "∞" },
      { label: "BOX TESTING", value: 10 },
    ],
  },
};

export const TEAM_ORDER = [
  "Žygimantas",
  "Arturas",
  "Ernest",
  "Lukas",
  "Domas",
  "Sky Wee",
  "Igor",
  "Marcin",
  "Feta",
  "Kaciukas",
];

const members: ITeamMember[] = TEAM_ORDER.map((name) =>
  teamMembers.find((m) => m.name === name),
).filter((m): m is ITeamMember => Boolean(m));

const HUMANS = members.filter((m) => TEAM_EXTRAS[m.name]?.guild !== "MORALE");

const GUILD_COUNTS = GUILD_ORDER.map((guild) => ({
  guild,
  count: members.filter((m) => TEAM_EXTRAS[m.name]?.guild === guild).length,
}));

const SOCIAL_LABELS: Record<string, string> = {
  [SocialImages.LINKEDIN]: "LinkedIn",
  [SocialImages.X]: "X",
  [SocialImages.INSTAGRAM]: "Instagram",
  [SocialImages.WARPCAST]: "Warpcast",
  [SocialImages.EMAIL]: "Website",
};
const socialLabel = (img: string) => SOCIAL_LABELS[img] ?? "Link";

// Copied from ProofSection on purpose: ProofSection is mocked in page tests.
const CHIP =
  "inline-flex items-center gap-1.5 rounded-full border border-tt-cream/40 bg-black/45 backdrop-blur-sm px-3 py-1 3xl:px-5 3xl:py-2 3xl:gap-2.5 font-primary uppercase tracking-[0.12em] md:tracking-widest text-[12px] md:text-p6 3xl:text-p4 text-tt-cream";

const guildOf = (m: ITeamMember) => TEAM_EXTRAS[m.name]?.guild ?? "BUILD";
const pad2 = (n: number) => String(n).padStart(2, "0");

/** Panel sits beside the portrait (overlaid on the stage) from this width up. */
const OVERLAY_QUERY = "(min-width: 1280px)";
const HOVER_DELAY_MS = 180;
const REVEAL_FALLBACK_MS = 2500;

type Phase = "static" | "pre" | "in";

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

const StatBar = ({ label, value }: IStatBar) => {
  const filled = value === "∞" ? 10 : Math.max(0, Math.min(10, value));
  return (
    <div>
      <div className="flex justify-between font-primary text-[12px] md:text-p6 3xl:text-p4 uppercase leading-none mb-1">
        <span>{label}</span>
        <span aria-hidden>{value === "∞" ? "∞" : `${value}/10`}</span>
      </div>
      <div className="flex gap-[3px]" aria-hidden>
        {Array.from({ length: 10 }, (_, i) => (
          <span
            key={i}
            className={`h-2 3xl:h-3 flex-1 ${
              i < filled ? "bg-tt-gold-ink" : "bg-tt-gold-ink/20"
            }`}
          />
        ))}
      </div>
      <span className="sr-only">
        {label} {value === "∞" ? "infinite" : value} out of 10
      </span>
    </div>
  );
};

/** Social row columns at lg+, so every button in a row is the same width (4 links → 2×2). */
const SOCIAL_COLS: Record<number, string> = {
  1: "lg:grid-cols-1",
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-2",
};

const CrewPanel = ({ member, index }: { member: ITeamMember; index: number }) => {
  const extra = TEAM_EXTRAS[member.name];
  const guild = GUILD_META[guildOf(member)];
  const isCat = guildOf(member) === "MORALE";
  return (
    <div
      role="tabpanel"
      id="team-panel"
      aria-labelledby={`team-tab-${index}`}
      tabIndex={0}
      className="team-pixel-frame [--pf:rgb(var(--tt-gold-shadow))] relative bg-tt-cream text-tt-gold-ink overflow-hidden focus-visible:outline-dashed focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-[8px]"
    >
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none bg-[repeating-linear-gradient(0deg,rgba(0,0,0,.05)_0_1px,transparent_1px_3px)]"
      />
      <div className="relative bg-tt-gold-500 px-4 py-2 3xl:px-6 3xl:py-3 font-primary uppercase text-[12px] md:text-p6 3xl:text-p4 tracking-[0.12em] md:tracking-widest flex justify-between items-center">
        <span>
          Player {pad2(index + 1)} / {pad2(members.length)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <img src={guild.icon} alt="" className="w-4 h-4 3xl:w-6 3xl:h-6 object-contain" />
          {guild.label}
        </span>
      </div>
      <div
        key={member.name}
        className="relative px-4 py-4 3xl:px-6 3xl:py-6 space-y-3 3xl:space-y-5 team-panel-body"
      >
        <h3 className="font-paws text-h6 lg:text-h5 3xl:text-h3 leading-none">
          {member.name}
        </h3>
        <div className="flex flex-wrap gap-2">
          <span className="border-2 border-tt-gold-shadow rounded-md px-2 3xl:px-3 3xl:py-0.5 font-primary text-[12px] md:text-p6 3xl:text-p4 uppercase">
            {member.role}
          </span>
        </div>
        {extra?.quest && (
          <p className="font-primary text-p5 3xl:text-p3 leading-snug">{extra.quest}</p>
        )}
        {extra?.bars && (
          <div className="space-y-2 3xl:space-y-3 pt-1">
            {extra.bars.map((bar) => (
              <StatBar key={bar.label} {...bar} />
            ))}
          </div>
        )}
        {!isCat && member.socials.length > 0 && (
          <ul
            className={`flex flex-wrap gap-3 pt-1 lg:grid ${
              SOCIAL_COLS[member.socials.length] ?? "lg:grid-cols-3"
            }`}
          >
            {member.socials.map((s) => {
              const label = socialLabel(s.img);
              return (
                <li key={s.link} className="min-w-0">
                  <a
                    href={s.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${member.name} on ${label} (opens in new tab)`}
                    className="team-pixel-frame [--pf:rgb(var(--tt-gold-shadow))] inline-flex items-center justify-center gap-2 min-h-[48px] min-w-[48px] lg:w-full lg:px-2 3xl:min-h-[64px] 3xl:px-4 bg-tt-cream hover:brightness-110 hover:-translate-y-0.5 transition-transform [transition-timing-function:steps(2)] duration-100 motion-reduce:transform-none focus-visible:outline-dashed focus-visible:outline-2 focus-visible:outline-offset-[6px] focus-visible:outline-tt-gold-shadow"
                  >
                    <img
                      src={s.img}
                      alt=""
                      className="shrink-0 w-[26px] h-[26px] 3xl:w-9 3xl:h-9 object-contain"
                    />
                    <span
                      aria-hidden
                      className="hidden lg:inline font-primary uppercase text-p6 3xl:text-p4 tracking-normal truncate"
                    >
                      {label}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

/** Members split by guild, keeping each member's global tab index. TEAM_ORDER is guild-contiguous. */
const GROUPS = GUILD_ORDER.map((guild) => ({
  guild,
  items: members
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => guildOf(m) === guild),
})).filter((g) => g.items.length > 0);

export interface CrewCtaState {
  signedIn?: boolean;
  /** `onboarding.state` from the profile (plan G3). */
  onboardingState?: string | null;
  catName?: string | null;
}

/**
 * Longest cat name the crew CTA spells out. The pixel button never wraps (its frame is fixed
 * height), and names go up to 16 characters (backend `CAT_NAME_MAX_LENGTH`), so longer names fall
 * back to "YOUR CAT IS WAITING" to keep the button inside a 360px phone.
 */
export const CREW_CTA_MAX_NAME = 10;

/**
 * The crew CTA label (plan 2.13 row 34): "MEET YOUR CAT" when signed out or while Meet your cat is
 * pending; "{CAT} IS WAITING" once the player has named a cat ("YOUR CAT IS WAITING" when the name
 * is longer than `CREW_CTA_MAX_NAME`). Never "PLAY TO SAVE".
 */
export function crewCtaLabel({ signedIn, onboardingState, catName }: CrewCtaState = {}): string {
  const name = (catName || "").trim();
  if (!signedIn || onboardingState === "pending" || !name) return "MEET YOUR CAT";
  if (name.length > CREW_CTA_MAX_NAME) return "YOUR CAT IS WAITING";
  return `${name.toUpperCase()} IS WAITING`;
}

export interface TeamSectionProps {
  /**
   * Player state for the CTA label, from the landing's optional auth read (`LandingPlayer`).
   * Missing (server HTML, no session) means signed out: "MEET YOUR CAT".
   */
  cta?: CrewCtaState;
}

export const TeamSection = ({ cta }: TeamSectionProps = {}) => {
  const ctaLabel = crewCtaLabel(cta);
  const [selected, setSelected] = useState(0);
  const [prevIdx, setPrevIdx] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>("static");
  const sectionRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedRef = useRef(0);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPointer = useRef<string>("");

  const clearHover = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
  };

  useEffect(() => clearHover, []);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (prefersReducedMotion()) return;
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) return;
    // The hidden pre-reveal state only exists after mount, so no-JS and SSR stay visible.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPhase("pre");
    let done = false;
    const reveal = () => {
      if (done) return;
      done = true;
      setPhase("in");
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
    // Belt and braces: if the observer never reports (odd browsers, zoom), reveal once it is on screen.
    const onScroll = () => {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0) reveal();
    };
    // threshold 0: the section is far taller than a landscape phone, so any overlap must count.
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((x) => x.isIntersecting)) reveal();
      },
      { threshold: 0, rootMargin: "0px 0px -15% 0px" },
    );
    io.observe(el);
    const armScroll = setTimeout(
      () => window.addEventListener("scroll", onScroll, { passive: true }),
      REVEAL_FALLBACK_MS,
    );
    return () => {
      done = true;
      io.disconnect();
      clearTimeout(armScroll);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  const select = (i: number) => {
    const cur = selectedRef.current;
    if (cur === i) return;
    selectedRef.current = i;
    // The previous photo stays under the new one, so the wipe never shows an empty disc.
    setPrevIdx(cur);
    setSelected(i);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const last = members.length - 1;
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown")
      next = selected === last ? 0 : selected + 1;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
      next = selected === 0 ? last : selected - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    if (next === null) return;
    e.preventDefault();
    select(next);
    tabRefs.current[next]?.focus();
  };

  const onPointerEnter = (i: number) => (e: PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType !== "mouse") return;
    clearHover();
    // Long enough that sweeping across tiles on the way to the panel doesn't switch member.
    hoverTimer.current = setTimeout(() => select(i), HOVER_DELAY_MS);
  };

  const onClick = (i: number) => {
    select(i);
    // Touch: the panel is above the roster below xl, so bring it into view to show the tap did something.
    if (lastPointer.current !== "touch" && lastPointer.current !== "pen") return;
    if (window.matchMedia?.(OVERLAY_QUERY).matches) return;
    panelRef.current?.scrollIntoView?.({
      block: "nearest",
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  };

  const member = members[selected] ?? members[0];
  if (!member) return null;
  const prevMember = prevIdx === null ? null : members[prevIdx];
  const guildColor = GUILD_META[guildOf(member)].color;
  const memberImgClass = TEAM_EXTRAS[member.name]?.imgClass ?? "";

  const renderTile = (m: ITeamMember, i: number, firstOfGuild: boolean) => {
    const sel = i === selected;
    const g = guildOf(m);
    const color = GUILD_META[g].color;
    const imgClass = TEAM_EXTRAS[m.name]?.imgClass ?? "";
    return (
      <button
        key={m.name}
        ref={(el) => {
          tabRefs.current[i] = el;
        }}
        type="button"
        role="tab"
        id={`team-tab-${i}`}
        aria-selected={sel}
        aria-controls="team-panel"
        tabIndex={sel ? 0 : -1}
        data-selected={sel}
        onPointerDown={(e) => {
          lastPointer.current = e.pointerType;
        }}
        onClick={() => onClick(i)}
        onFocus={() => select(i)}
        onPointerEnter={onPointerEnter(i)}
        onPointerLeave={clearHover}
        style={
          {
            "--pf": sel ? GOLD[400] : NIGHT[500],
            "--i": i,
          } as CSSProperties
        }
        className="team-slot team-pixel-frame group relative flex flex-col items-center gap-1 md:gap-1.5 min-w-0 min-h-[60px] bg-tt-night-700/85 px-1 pt-1.5 pb-1 md:p-2 md:pt-3 text-center transition-transform [transition-timing-function:steps(3)] duration-150 hover:-translate-y-1 data-[selected=true]:-translate-y-1 data-[selected=true]:bg-tt-night-600 motion-reduce:transform-none focus-visible:outline-dashed focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-4 md:focus-visible:outline-offset-[8px]"
      >
        {firstOfGuild && (
          <span
            aria-hidden
            className="2xl:hidden absolute inset-x-0 -top-1 h-1 pointer-events-none"
            style={{ backgroundColor: color }}
          />
        )}
        <span
          aria-hidden
          className="relative shrink-0 block w-full max-w-[52px] aspect-square md:max-w-none md:w-20 md:h-20 lg:w-24 lg:h-24 3xl:w-32 3xl:h-32 rounded-full p-[3px]"
          style={{
            background: `radial-gradient(circle at 50% 30%, ${color}, ${color}55 70%)`,
          }}
        >
          <span className="block w-full h-full rounded-full overflow-hidden bg-tt-night-700">
            <img
              src={m.img}
              alt=""
              loading="lazy"
              decoding="async"
              className={`w-full h-full object-cover saturate-[.85] brightness-95 transition-[filter] duration-150 group-hover:saturate-100 group-hover:brightness-110 group-data-[selected=true]:saturate-100 group-data-[selected=true]:brightness-110 ${imgClass}`}
            />
          </span>
          {g === "MORALE" && (
            <span
              className="absolute -bottom-1 -right-1 grid place-items-center w-5 h-5 md:w-6 md:h-6 3xl:w-8 3xl:h-8 rounded-full border-2 border-tt-night-800"
              style={{ backgroundColor: color }}
            >
              <img
                src={GUILD_META.MORALE.icon}
                alt=""
                className="w-3 h-3 md:w-3.5 md:h-3.5 3xl:w-5 3xl:h-5 object-contain"
              />
            </span>
          )}
        </span>
        <span className="min-w-0 w-full">
          <span className="block font-primary font-bold text-[11px] tracking-tight md:tracking-normal md:text-p5 lg:text-p4 3xl:text-p2 text-tt-cream truncate leading-tight">
            {m.name}
          </span>{" "}
          {/* Phones show photo + name only; the role is in the panel above. */}
          <span className="sr-only md:not-sr-only md:block font-primary uppercase md:text-[12px] lg:text-p6 3xl:text-p4 tracking-wide leading-tight text-tt-cream/85 md:line-clamp-2">
            {m.role}
          </span>
        </span>
        {sel && (
          <>
            <span
              aria-hidden
              className="absolute -top-5 3xl:-top-7 left-1/2 -translate-x-1/2 text-tt-gold-400 text-p6 3xl:text-p4 team-blink hidden md:block"
            >
              ▼
            </span>
            <span
              aria-hidden
              className="absolute inset-0 overflow-hidden pointer-events-none"
            >
              <span className="team-glint absolute inset-y-0 -left-1/2 w-1/2" />
            </span>
          </>
        )}
      </button>
    );
  };

  return (
    <section
      ref={sectionRef}
      id="team"
      aria-labelledby="team-title"
      data-testid="team-section"
      data-phase={phase}
      className="team relative w-full overflow-hidden isolate bg-tt-night-900"
    >
      <img
        src={cdnFile("landing/card-bg.webp")}
        alt=""
        aria-hidden
        loading="lazy"
        decoding="async"
        className="absolute inset-0 w-full h-full object-cover pixelated pointer-events-none"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/25 to-black/80"
      />
      {/* Blends with the matching fade at the bottom of rescue-hub. */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-32 md:h-48 bg-gradient-to-b from-tt-night-900 to-transparent"
      />

      <div className="relative z-10 px-4 md:px-8 pt-12 md:pt-16 lg:pt-20 3xl:pt-28 pb-24 3xl:pb-40">
        {/* HEADER */}
        <header className="relative z-20 max-w-[900px] 3xl:max-w-[1300px] mx-auto text-center">
          <p className="font-primary uppercase tracking-[0.12em] text-p5 md:text-p4 3xl:text-p2 text-tt-cream/90 max-w-[62ch] text-balance mx-auto drop-shadow-lg">
            <span aria-hidden className="text-tt-gold-400 team-blink inline-block mr-2">
              ▼
            </span>
            Meet the party behind every rescue
          </p>
          <h2
            id="team-title"
            className="mt-4 font-paws uppercase text-tt-cream glow text-balance leading-[0.95] [word-spacing:0.3em] text-h5 md:text-h3 lg:text-h2 3xl:text-h1 team-title"
          >
            United To Save Cats
          </h2>
          <p className="mt-4 font-primary text-p5 md:text-p4 3xl:text-p2 text-tt-cream/90 drop-shadow-lg max-w-[34ch] md:max-w-[52ch] mx-auto">
            The party behind a live game on web, iOS and Android: engineering,
            game design, art, growth and legal. Two cats handle QA.
          </p>
          <ul
            className="mt-5 3xl:mt-8 flex flex-wrap justify-center gap-2 3xl:gap-3"
            aria-label="Team by guild"
          >
            <li className={`${CHIP} border-tt-cream/70`}>
              {HUMANS.length} humans + {members.length - HUMANS.length} cats
            </li>
            {GUILD_COUNTS.map(({ guild, count }) => (
              <li
                key={guild}
                className={CHIP}
                style={{ borderColor: GUILD_META[guild].color + "99" }}
              >
                <span
                  aria-hidden
                  className="grid place-items-center w-5 h-5 3xl:w-7 3xl:h-7 rounded-full"
                  style={{ backgroundColor: GUILD_META[guild].color }}
                >
                  <img
                    src={GUILD_META[guild].icon}
                    alt=""
                    className="w-3.5 h-3.5 3xl:w-5 3xl:h-5 object-contain"
                  />
                </span>
                {count} {GUILD_META[guild].label}
              </li>
            ))}
          </ul>
        </header>

        {/*
          STAGE, ROSTER, PANEL. DOM order is roster before panel so Tab goes tab -> panel -> links -> CTA;
          flex `order` puts the panel between stage and roster below xl. From xl the panel box is the
          stage's size and position, so the overlay tracks the stage at any width.
        */}
        <div className="relative flex flex-col -mx-4 md:-mx-8 mt-6 md:mt-8 lg:-mt-[min(16%,300px)]">
          <div className="order-1 relative mx-auto w-full max-w-[1920px]">
            <div className="relative w-full aspect-[16/11] md:aspect-[16/9] lg:aspect-[2752/1320] pointer-events-none team-stage [mask-image:linear-gradient(180deg,#000_84%,transparent)] lg:[mask-image:linear-gradient(90deg,transparent,#000_6%,#000_94%,transparent),linear-gradient(180deg,transparent,#000_12%,#000_78%,transparent)] lg:[mask-composite:intersect] lg:[-webkit-mask-composite:source-in]">
              <div
                aria-hidden
                className="absolute inset-0 bg-[radial-gradient(ellipse_45%_35%_at_50%_72%,rgb(var(--tt-gold-400)/.35),transparent_70%)] lg:bg-[radial-gradient(ellipse_45%_40%_at_50%_67%,rgb(var(--tt-gold-400)/.35),transparent_70%)] xl:bg-[radial-gradient(ellipse_32%_44%_at_38%_65%,rgb(var(--tt-gold-400)/.38),transparent_70%)] motion-safe:animate-pulseWeak"
              />
              <img
                src={cdnFile("landing/hero-ground.webp")}
                alt=""
                aria-hidden
                loading="lazy"
                decoding="async"
                className="absolute inset-0 w-full h-full object-cover object-bottom pixelated"
              />
              <div
                aria-hidden
                className="absolute bottom-[33%] md:bottom-[27%] lg:bottom-[28%] left-1/2 xl:left-[38%] -translate-x-1/2 w-[18%] xl:w-[14%] max-w-[220px] h-[3%] rounded-[50%] bg-black/45 blur-sm"
              />
              {/* Outer div centres; inner div floats. Keeping them apart stops the float keyframes overriding the centring transform. */}
              {/* Capped near the source photos' resolution so they aren't blown up. */}
              <div className="absolute left-1/2 xl:left-[38%] -translate-x-1/2 bottom-[33%] md:bottom-[29%] lg:bottom-[30%] h-[50%] md:h-[38%] lg:h-[45%] max-h-[220px] 3xl:max-h-[260px] aspect-square">
                <div className="w-full h-full motion-safe:animate-hover">
                  <div
                    key={member.name}
                    className="team-token w-full h-full rounded-full"
                    style={{
                      boxShadow: `0 0 0 4px ${guildColor}, 0 0 0 8px ${NIGHT[800]}, 0 0 0 10px ${guildColor}88, 0 0 24px 10px ${guildColor}66, 0 0 60px 20px rgb(var(--tt-gold-400)/.25)`,
                    }}
                  >
                    <div className="relative w-full h-full rounded-full overflow-hidden bg-tt-night-700">
                      {prevMember && prevMember !== member && (
                        <img
                          src={prevMember.img}
                          alt=""
                          aria-hidden
                          decoding="async"
                          className={`absolute inset-0 w-full h-full object-cover ${
                            TEAM_EXTRAS[prevMember.name]?.imgClass ?? ""
                          }`}
                        />
                      )}
                      <img
                        src={member.img}
                        alt={`${member.name}, ${member.role}`}
                        decoding="async"
                        className={`team-token-img relative w-full h-full object-cover ${memberImgClass}`}
                      />
                      {/* Pixel grid ties the photo into the pixel art and hides low source resolution. */}
                      <span
                        aria-hidden
                        className="absolute inset-0 rounded-full pointer-events-none mix-blend-multiply opacity-40 bg-[repeating-linear-gradient(0deg,#0003_0_2px,transparent_2px_4px),repeating-linear-gradient(90deg,#0002_0_2px,transparent_2px_4px)]"
                      />
                      <span
                        aria-hidden
                        className="absolute inset-0 rounded-full pointer-events-none shadow-[inset_0_0_24px_8px_rgba(18,13,31,.7)]"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ROSTER */}
          <div className="order-3 relative z-20 px-4 md:px-8 mt-6 xl:-mt-[3%]">
            <div
              role="tablist"
              aria-label="Team members"
              onKeyDown={onKeyDown}
              className="team-roster mx-auto bg-tt-night-800/70 backdrop-blur-[2px] p-2 md:p-4 3xl:p-6 max-w-[560px] md:max-w-[880px] lg:max-w-[1000px] 2xl:max-w-[1480px] 3xl:max-w-[1900px] [--tg:16px] 3xl:[--tg:20px]"
            >
              <div className="grid grid-cols-5 gap-x-1.5 gap-y-3 md:gap-4 2xl:flex 2xl:gap-[calc(var(--tg)*2.5)] 2xl:pt-1">
                {GROUPS.map(({ guild, items }) => (
                  <div
                    key={guild}
                    role="none"
                    className="contents 2xl:flex 2xl:flex-col 2xl:gap-6 3xl:gap-8 2xl:min-w-0"
                    // Grow by member count from a basis of the inner gaps, so every tile ends up the same width.
                    style={{
                      flex: `${items.length} 1 calc(${items.length - 1} * var(--tg))`,
                    }}
                  >
                    <span
                      aria-hidden
                      className="hidden 2xl:flex items-center gap-2 font-primary font-bold uppercase text-p5 3xl:text-p3 tracking-widest"
                      style={{ color: GUILD_META[guild].color }}
                    >
                      <img
                        src={GUILD_META[guild].icon}
                        alt=""
                        className="w-4 h-4 3xl:w-6 3xl:h-6 object-contain"
                      />
                      {GUILD_META[guild].label}
                    </span>
                    <div
                      role="none"
                      className="contents 2xl:grid 2xl:flex-1 2xl:gap-[var(--tg)]"
                      style={{
                        gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`,
                      }}
                    >
                      {items.map(({ m, i }, k) => renderTile(m, i, k === 0))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* PANEL: in flow under the stage below xl; beside the portrait, joined by a connector, from xl. */}
          <div className="order-2 relative z-30 px-4 md:px-8 mt-0 md:-mt-14 lg:-mt-[12%] xl:mt-0 xl:px-0 xl:absolute xl:inset-x-0 xl:top-0 xl:mx-auto xl:w-full xl:max-w-[1920px] xl:aspect-[2752/1320] xl:pointer-events-none">
            <div
              ref={panelRef}
              className="relative mx-auto max-w-md md:max-w-lg scroll-mt-4 xl:mx-0 xl:max-w-none xl:absolute xl:pointer-events-auto xl:w-[clamp(340px,28%,440px)] xl:left-[calc(38%+min(10.8%,110px)+48px)] xl:top-[calc(70%-min(22.5%,110px))] xl:-translate-y-1/2 3xl:w-[560px] 3xl:left-[calc(38%+130px+64px)] 3xl:top-[calc(70%-130px)]"
            >
              {/* Separate from panelRef: its reveal animation must not override the xl centring transform. */}
              <div className="team-panel-wrap relative">
                <span
                  aria-hidden
                  className="hidden xl:block absolute right-full top-1/2 -translate-y-1/2 w-[44px] 3xl:w-[60px] h-1 mr-1 bg-[repeating-linear-gradient(90deg,rgb(var(--tt-gold-400))_0_8px,transparent_8px_12px)] drop-shadow-[0_0_6px_rgb(var(--tt-gold-400)/.8)]"
                />
                <span
                  aria-hidden
                  className="hidden xl:block absolute right-full top-1/2 -translate-y-1/2 w-2 h-2 bg-tt-gold-400 mr-[48px] 3xl:mr-[64px]"
                />
                <CrewPanel member={member} index={selected} />
              </div>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="relative mt-16 md:mt-20 3xl:mt-28 flex flex-col items-center gap-8 md:gap-12 3xl:gap-20 text-center">
          <div
            aria-hidden
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(90vw,720px)] 3xl:w-[1100px] aspect-[2/1] bg-[radial-gradient(ellipse_at_center,rgb(var(--tt-gold-400)/.22),transparent_65%)] pointer-events-none"
          />
          <p className="relative font-paws uppercase text-tt-cream glow text-balance leading-[1.15] [word-spacing:0.3em] text-p3 md:text-h6 3xl:text-h4">
            <span className="font-primary">…</span>and{" "}
            <span className="text-h5 md:text-h3 3xl:text-h2">one</span> cat
            waiting for you
          </p>
          {/* One tab stop: the PixelButton renders as a span inside the link (valid HTML). */}
          {/* Plain anchor on purpose: the game shell needs a full page load. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href={landingCtaHref("crew")}
            data-testid="crew-cta"
            className="relative block py-2 md:py-6 3xl:py-10 rounded-xl focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-8 focus-visible:outline-tt-gold-400"
          >
            <span className="block max-w-[calc(100vw-2rem)] scale-100 sm:scale-110 3xl:scale-150 origin-center">
              <PixelButton as="span" text={ctaLabel} size="lg" />
            </span>
          </a>
        </div>
      </div>
    </section>
  );
};
