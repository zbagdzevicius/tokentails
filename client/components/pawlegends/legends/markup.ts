/**
 * The `/legends` landing markup (landing A/B arm B): a port of the scroll-lane-map landing
 * (docs/plans/moba/landings/03-scroll-lane-map.html in the Pawlegends planning repo). One HTML string rendered under
 * `.lgb`; `motion.js` animates it in place, so React never re-renders inside it.
 *
 * Changes from the preview: no inlined base64 (every picture is a file in `public/pawlegends/landing`, shared with
 * the `/pawlegends` landing where it is the same picture), the roster and every count come from the landing roster
 * (`../landing/roster.ts`) and the game facts from `./facts.ts` (both checked against the game source in CI), and
 * the copy says only what the game does today: two lanes, four towers a team, co-op against bots (no PvP), party
 * links and room codes, the real desktop and phone controls. No money claim (docs/CLAIMS.md), no player counts.
 */
import {
  countWord,
  gridHeroes,
  justReleased,
  LANDING_ROSTER,
  landingCats,
  landingDogs,
  liveRoster,
  newcomers,
  type LandingHero,
} from "../landing/roster";
import { variantPlayHref } from "../landingVariant";
import { PAWLEGENDS_TERMS_PATH } from "../flags";
import { LEGENDS_FACTS as F } from "./facts";

/** The landing media folder (hashed names, cached for good: next.config.js), shared with `/pawlegends`. */
const LANDING_ASSET = (name: string) => `/pawlegends/landing/${name}`;
const A = {
  puppetLambo: LANDING_ASSET("puppet-lambo.b3bb7b85.webp"),
  puppetDuchess: LANDING_ASSET("puppet-duchess.928395b5.webp"),
  puppetPixel: LANDING_ASSET("puppet-pixel.61b09b68.webp"),
  teamfight: LANDING_ASSET("shot-teamfight.1be7757e.webp"),
  desktop: LANDING_ASSET("shot-aim.2a268c6c.webp"),
  phone: LANDING_ASSET("shot-phone.24bce0a7.webp"),
  mascot: LANDING_ASSET("mascot2.ff449081.webp"),
  logo: LANDING_ASSET("tt-logo.19b6c796.webp"),
  /** The PawLegends logo (brand/pawlegends, founder pick #48: wordmark, lightning, paw fist-bump), 1200x757. */
  brandLogo: LANDING_ASSET("logo.7d6a0f0e.webp"),
  /** The same wordmark without the paws, for the small top-left brand link, 1200x334. */
  wordmark: LANDING_ASSET("logo-compact.ec9e56ee.webp"),
};
/** Fredoka, the game's UI face: the same subset file as the `/pawlegends` landing (its LANDING_FONT). */
export const LEGENDS_FONT = LANDING_ASSET("fredoka-latin.ec85d7eb.woff2");
/** Smaller copies next to the originals (`<name>.w<width>.webp`), the same ones the `/pawlegends` landing uses. */
const SMALLER: Readonly<Record<string, number>> = Object.freeze({
  [A.teamfight]: 720,
  [A.desktop]: 720,
  [A.logo]: 244,
  [A.brandLogo]: 640,
  [A.wordmark]: 640,
});
/** Portrait tile copies are 280 px wide (`../landing/markup.ts` TILE_PORTRAIT_WIDTH). */
const TILE_W = 280;
const sized = (src: string, w: number) => src.replace(/\.webp$/, `.w${w}.webp`);
const srcset = (src: string, w: number, full: number) => `${sized(src, w)} ${w}w, ${src} ${full}w`;
/** Roster cards: 2 columns to 760 px, 3 to 1100, then 5 in a card about 900 px wide. */
const CARD_SIZES = "(max-width:760px) 44vw, (max-width:1100px) 28vw, 170px";

/** Play links: the `from` tag feeds `pawlegends_open`, `lv=B` names this landing arm (landingVariant.ts). */
export const LEGENDS_CTA = Object.freeze({
  hud: variantPlayHref("legends_hud", "B"),
  hero: variantPlayHref("legends_hero", "B"),
  final: variantPlayHref("legends_final", "B"),
  footer: variantPlayHref("legends_footer", "B"),
});

/** Every file the page loads from public/ (the unit test checks they exist). */
export const LEGENDS_FILES: readonly string[] = Object.freeze([
  LEGENDS_FONT,
  ...Object.values(A),
  ...Object.entries(SMALLER).map(([src, w]) => sized(src, w)),
  ...gridHeroes().flatMap((h) => (h.portrait ? [h.portrait, sized(h.portrait, TILE_W)] : [])),
]);

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** Fredoka has no precomposed ė but has the combining dot, so names are written decomposed (as the game does). */
const shown = (name: string) => esc(name.normalize("NFD"));
const hero = (id: string): LandingHero => {
  const h = LANDING_ROSTER.find((x) => x.id === id);
  if (!h) throw new Error(`legends landing: unknown hero ${id}`);
  return h;
};
const tile = (h: LandingHero) => sized(h.portrait ?? "", TILE_W);
const and = (names: string[]) => (names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0] ?? "");
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const PAW_BTN =
  '<svg class="paw" viewBox="0 0 24 24" aria-hidden="true"><g fill="#fff"><ellipse cx="12" cy="16" rx="5.2" ry="4.4"/><circle cx="5.4" cy="10.4" r="2.2"/><circle cx="9.4" cy="6.6" r="2.3"/><circle cx="14.6" cy="6.6" r="2.3"/><circle cx="18.6" cy="10.4" r="2.2"/></g></svg>';
const PAW_CARD =
  '<svg viewBox="-30 -30 60 60" aria-hidden="true"><ellipse cx="0" cy="8" rx="15" ry="12.5"/><circle cx="-16" cy="-6" r="6.4"/><circle cx="-5.6" cy="-16.5" r="6.4"/><circle cx="5.6" cy="-16.5" r="6.4"/><circle cx="16" cy="-6" r="6.4"/></svg>';

const play = (href: string, cta: string, label: string, cls = "btn play") =>
  `<a class="${cls}" href="${href}" data-cta="${cta}">${cls.includes("sm") ? "" : PAW_BTN}${label}</a>`;

/** A lane tower (the page's own drawing; the dog team has F.towersPerTeam of them in the game too). */
const tower = (n: number) =>
  `<div class="lanecol"><div class="anchor" data-a="t${n}"><div class="tower" data-t="${n}"><div class="range"></div><div class="shadow"></div><div class="tw"><div class="body"><i class="flash"></i></div><div class="cap"></div></div><div class="rubble"></div><span class="capflag"></span><div class="hp"><s></s><i></i></div><span class="tlbl">Tower ${n}</span></div></div></div>`;
const label = (pin: string, text: string, cat = false) =>
  `<p class="maplabel"><span class="pinw"><span class="pin${cat ? " cat" : ""}"><b>${pin}</b></span></span>${text}</p>`;

/** A hero on the cat base plaza: a cut-out puppet with blinking lids (positions fit that picture). */
const puppet = (src: string, name: string, style: string, lids: string) =>
  `<span class="pinhero" style="${style}"><span class="disc"></span><span class="pup"><span class="bob"><img src="${src}" alt="" width="300" height="419" decoding="async">${lids}</span></span><span class="nm">${name}</span></span>`;

function card(h: LandingHero, i: number, fresh: boolean): string {
  const src = h.portrait ?? "";
  const side = h.side === "cat" ? "Cat" : "Dog";
  const alt = `${h.name}, ${side.toLowerCase()} ${h.role.toLowerCase()}${h.breed ? `, ${h.breed.toLowerCase()}` : ""}`;
  return (
    `<li class="slot" data-r="${h.role}" data-i="${i}"><div class="hc${h.side === "dog" ? " dog" : ""}"><div class="stage">` +
    `<img src="${tile(h)}" srcset="${srcset(src, TILE_W, 420)}" sizes="${CARD_SIZES}" alt="${esc(alt)}" width="420" height="574" loading="lazy" decoding="async">` +
    `${fresh ? '<span class="new">New</span>' : ""}</div>` +
    `<div class="meta"><span class="nm">${shown(h.name)}</span><span class="rl"><span class="side">${side}</span>${h.role}</span></div></div></li>`
  );
}

/** Heroes not in the game build yet (or without art): name, breed and role, a paw instead of a stand-in picture. */
function comingNext(list: LandingHero[]): string {
  if (!list.length) return "";
  const dogs = list.every((h) => h.side === "dog");
  const head = `Coming next: ${countWord(list.length).toLowerCase()} new ${dogs ? (list.length === 1 ? "dog" : "dogs") : list.length === 1 ? "hero" : "heroes"}`;
  const item = (h: LandingHero) =>
    `<li><span class="pc" aria-hidden="true">${PAW_CARD}</span><span><b>${shown(h.name)}</b><small>${esc([h.breed, h.role].filter(Boolean).join(" · "))}</small></span></li>`;
  return `<div class="next" role="group" aria-labelledby="lgb-next"><p class="next-h" id="lgb-next">${esc(head)}</p><ul role="list">${list.map(item).join("")}</ul></div>`;
}

/**
 * The rest stop (Pink Paw), its own copy unit like the `/pawlegends` landing's shelter section: it names the shelter
 * champions (real Pink Paw cats, the game's data/heroes/shelter.ts) and makes no money or impact claim (a share of a
 * sale needs a facts-registry id first: docs/CLAIMS.md, copy-lint R2).
 */
function shelterSection(champions: LandingHero[]): string {
  return `  <section class="leg shelter" data-side="R" aria-labelledby="lgb-h-shelter">
    <div class="lanecol"><div class="anchor" data-a="rest"><div class="fountain" aria-hidden="true"><i></i><i></i><i></i><canvas></canvas><svg viewBox="0 0 24 22"><path d="M12 21C5 15.5 1 12 1 7a5.5 5.5 0 0 1 11-1 5.5 5.5 0 0 1 11 1c0 5-4 8.5-11 14z" fill="#ec5a8d" stroke="#fff" stroke-width="2"/></svg></div></div></div>
    <div class="content">
      ${label("&#9829;", "Rest stop · Pink Paw", true)}
      <div class="card">
        <div class="masc" role="img" aria-label="Token Tails mascot, a white cat thinking"><img class="mb" src="${A.mascot}" alt="" width="268" height="354" loading="lazy" decoding="async"><img class="mh" src="${A.mascot}" alt="" width="268" height="354" loading="lazy" decoding="async"><img class="mp" src="${A.mascot}" alt="" width="268" height="354" loading="lazy" decoding="async"></div>
        <div>
          <h2 class="kin" id="lgb-h-shelter">Made by a <em>cat game studio.</em></h2>
          <p class="lede rv">Pawlegends is made by <strong>Token Tails</strong>. ${and(champions.map((h) => shown(h.name)))} are real cats from the <strong>Pink Paw</strong> shelter, drawn as heroes.</p>
          <p class="rv"><a class="tlink" href="/">Meet the cats at Token Tails</a></p>
        </div>
      </div>
    </div>
  </section>`;
}

const ROLE_ORDER = ["Fighter", "Marksman", "Tank", "Assassin", "Mage", "Support"] as const;

export function legendsMarkup(): string {
  const grid = gridHeroes();
  const live = liveRoster();
  const cats = landingCats();
  const dogs = landingDogs();
  const fresh = new Set(justReleased().map((h) => h.id));
  const roles = ROLE_ORDER.filter((r) => grid.some((h) => h.role === r));
  const ourTeam = ["sage", "clem", "bengas"].map(hero);
  const theirTeam = grid.filter((h) => h.side === "dog").slice(0, F.teamSize);
  const champions = ["lambo", "aviete", "bengas", "gabe"].map(hero);
  const towers = F.towersPerTeam;
  const T = countWord(F.teamSize);
  const friends = F.partyMax - 1;

  return `<a class="skip" href="#play">Skip to Play</a>

<header class="hud">
  <a class="brand" href="#top" aria-label="Pawlegends, back to top"><img src="${sized(A.wordmark, 640)}" alt="" width="640" height="178" decoding="async"></a>
  <div class="score" role="status" aria-live="polite">
    <span class="t">Cats</span>
    <span class="twi" aria-hidden="true">${"<i></i>".repeat(towers)}</span>
    <span class="t dog">Dogs</span>
    <span class="lbl" id="twcount" aria-hidden="true">${plural(towers, "tower", "towers")} left</span>
    <span class="sr" id="twsr">${towers} dog towers standing</span>
  </div>
  ${play(LEGENDS_CTA.hud, "legends_hud", "Play free", "btn sm")}
</header>
<div class="toast" aria-hidden="true"></div>
<div class="flashw" aria-hidden="true"></div>

<div class="shadowfx" aria-hidden="true"><div class="cloud"></div><div class="cloud b"></div></div>
<canvas id="fx" aria-hidden="true"></canvas>
<div class="canopy" aria-hidden="true"><div class="lyr"></div></div>

<div class="camclip">
<div class="map" id="map">
  <div class="ground" id="ground" aria-hidden="true"></div>
  <svg class="lane" id="lane" aria-hidden="true">
    <path class="edge"/><path class="fill"/><path class="hi"/><path class="mark"/><path class="glow"/><path class="trail"/>
  </svg>
  <div class="trees" id="trees" aria-hidden="true"></div>
  <div class="crowns" id="crowns" aria-hidden="true"></div>

  <section class="leg hero" data-side="R" id="top" aria-labelledby="lgb-h1">
    <div class="lanecol">
      <div class="anchor" data-a="cat-base">
        <div class="plaza cat" aria-hidden="true">
          <span class="flag" style="left:16%;top:14%"></span><span class="flag" style="left:80%;top:12%"></span>
          <span class="flag" style="left:10%;top:70%"></span><span class="flag" style="left:86%;top:68%"></span>
          <div class="nexus"><svg viewBox="0 0 120 110"><ellipse cx="60" cy="100" rx="44" ry="9" fill="#c23c6f" opacity=".5"/><g class="hov"><circle cx="60" cy="54" r="46" fill="#ec5a8d" stroke="#8a1f47" stroke-width="4"/><path d="M22 36c30 6 58 26 72 56M30 82c10-26 38-48 70-50M44 12c14 22 18 54 10 86M18 60c26-14 60-16 86 2" stroke="#b32d61" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M96 70c10 6 16 16 14 26" stroke="#ec5a8d" stroke-width="5" fill="none" stroke-linecap="round"/><ellipse cx="44" cy="34" rx="10" ry="6" fill="#fff" opacity=".45"/></g></svg></div>
          ${puppet(A.puppetLambo, "Lambo", "left:22%;top:36%;--top:24%;--lc:#4f5057", '<i class="lid" style="left:38.5%;top:31.5%"></i><i class="lid" style="left:63.5%;top:31%"></i>')}
          ${puppet(A.puppetDuchess, "Duchess", "left:78%;top:40%;--top:18%;--lc:#f1e9e6", '<i class="lid" style="left:38.5%;top:38%"></i><i class="lid" style="left:59.5%;top:38%"></i>')}
          ${puppet(A.puppetPixel, "Pixel", "left:50%;top:84%;--top:12%;--lc:#d9d8e2", '<i class="lid" style="left:35.5%;top:44.5%;--lw:11%"></i><i class="lid" style="left:54.5%;top:44.5%;--lw:11%"></i>')}
        </div>
      </div>
    </div>
    <div class="content">
      <p class="maplabel ani"><span class="pinw"><span class="pin cat"><b>&#9733;</b></span></span>Our base · cat side</p>
      <h1 class="wordmark" id="lgb-h1" aria-label="Pawlegends"><span class="ch" data-r="-6"><span class="chi"><img src="${A.brandLogo}" srcset="${srcset(A.brandLogo, 640, 1200)}" sizes="(max-width:760px) 82vw, 460px" alt="" width="1200" height="757" fetchpriority="high" decoding="async"></span></span></h1>
      <p class="tag ani">A free ${F.teamSize}v${F.teamSize} cats vs dogs MOBA you play in your browser.</p>
      <div class="card ani">
        <p class="lede">The game&#8217;s map has ${countWord(F.lanes).toLowerCase()} lanes and ${countWord(towers).toLowerCase()} dog towers between you and their core. Scroll to push one lane here, then play the full match free on desktop or phone.</p>
        <div class="ctas">
          ${play(LEGENDS_CTA.hero, "legends_hero", "Play free in your browser")}
          <a class="btn ghost sm" href="/">By Token Tails</a>
        </div>
      </div>
      <div class="gates ani"><span class="gdot"></span><span id="gates">Gates open in <span class="num">${F.gateSeconds}</span></span></div>
      <div class="scrollhint ani"><svg width="18" height="22" viewBox="0 0 18 22" aria-hidden="true"><path d="M9 2v16M2 12l7 7 7-7" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>Scroll to push the lane</div>
    </div>
  </section>

  <section class="leg" data-side="L" aria-labelledby="lgb-h-aim">
    ${tower(1)}
    <div class="content">
      ${label("1", "Dog tower 1 · controls")}
      <div class="duo">
        <div class="card">
          <h2 class="kin" id="lgb-h-aim">Hold. Aim. <em>Let go.</em></h2>
          <p class="lede rv">Hold a skill key to see its range, aim with your cursor, release to cast. Quick cast in Settings fires on the press instead. On a phone, tap a skill to smart-cast or drag it to aim. On a phone, escape dashes and blinks fire on the tap, the full distance toward where you&#8217;re heading; the Pounce trick (D) fires on the press everywhere.</p>
          <p class="note rv">Try it on the practice pad &#8594;</p>
        </div>
        <div class="rv">
          <div class="pad" id="pad">
            <span class="hint" aria-hidden="true">Practice pad</span>
            <span class="msg" id="padmsg" role="status" aria-live="polite"></span>
            <svg class="field" id="field" viewBox="0 0 400 250" role="img" aria-label="Practice pad: a cat aims a skill at a dog training dummy. Press and hold on the pad or on a skill button, then release.">
              <defs><radialGradient id="lgb-pg" cx=".5" cy=".5" r=".6"><stop offset="0" stop-color="#f9e3b4"/><stop offset="1" stop-color="#f4d79c"/></radialGradient>
                <linearGradient id="lgb-shim" gradientUnits="userSpaceOnUse" x1="84" y1="176" x2="300" y2="90"><stop offset="0" stop-color="#ec5a8d" stop-opacity=".35"/><stop id="lgb-sh1" offset=".3" stop-color="#ec5a8d" stop-opacity=".4"/><stop id="lgb-sh2" offset=".4" stop-color="#fff" stop-opacity=".95"/><stop id="lgb-sh3" offset=".5" stop-color="#ec5a8d" stop-opacity=".4"/><stop offset="1" stop-color="#ec5a8d" stop-opacity=".6"/></linearGradient>
                <clipPath id="lgb-cpA"><circle cx="0" cy="0" r="27"/></clipPath><clipPath id="lgb-cpB"><circle cx="0" cy="0" r="25"/></clipPath></defs>
              <rect width="400" height="250" fill="url(#lgb-pg)"/>
              <path d="M0 210 C120 180 260 230 400 190" stroke="#e6bf7f" stroke-width="2" fill="none" stroke-dasharray="2 12" stroke-linecap="round"/>
              <g id="aimG" opacity="0"><path id="aimArrow" d="" fill="url(#lgb-shim)" stroke="#ec5a8d" stroke-width="3" stroke-linejoin="round"/><circle id="aimEnd" r="16" fill="none" stroke="#ec5a8d" stroke-width="3" stroke-dasharray="4 5"/></g>
              <g id="dummy" transform="translate(310 90)"><ellipse cx="4" cy="30" rx="30" ry="9" fill="#00000022"/><g id="dummyB"><circle r="29" fill="#1f3d91"/><g clip-path="url(#lgb-cpB)"><image href="${tile(hero("brutus"))}" x="-25" y="-25" width="50" height="50" preserveAspectRatio="xMidYMin slice"/></g><circle r="27" fill="none" stroke="#fff" stroke-width="3"/><circle id="dflash" r="29" fill="#fff" opacity="0"/><rect x="-24" y="-42" width="48" height="7" rx="3" fill="#2b1d2a"/><rect id="dhp" x="-23" y="-41" width="46" height="5" rx="2" fill="#5d86ff"/></g></g>
              <g id="hero" transform="translate(84 176)"><ellipse cx="0" cy="30" rx="34" ry="10" fill="#00000022"/><g id="heroB"><circle class="pulse" r="33" fill="none" stroke="#ec5a8d" stroke-width="3" opacity=".6"/><circle r="30" fill="#ec5a8d"/><g clip-path="url(#lgb-cpA)"><image href="${tile(hero("clem"))}" x="-27" y="-27" width="54" height="54" preserveAspectRatio="xMidYMin slice"/></g><circle r="28" fill="none" stroke="#fff" stroke-width="3"/></g></g>
              <g id="ptrail"></g>
              <g id="proj" opacity="0"><circle r="9" fill="#ec5a8d" stroke="#fff" stroke-width="3"/></g>
              <g id="pops"></g>
            </svg>
            <div class="skills" role="group" aria-label="Skills">
              <button class="sk" type="button" data-k="line" aria-describedby="lgb-tip1"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21L19 5M13 5h6v6" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg><kbd>Q</kbd><span class="tip" id="lgb-tip1" role="tooltip"><b>Line shot</b>Hold to show the arrow, aim, release to throw.</span></button>
              <button class="sk" type="button" data-k="area" aria-describedby="lgb-tip2"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" stroke="#fff" stroke-width="2.6" fill="none" stroke-dasharray="3 3"/><circle cx="12" cy="12" r="2.5" fill="#fff"/></svg><kbd>W</kbd><span class="tip" id="lgb-tip2" role="tooltip"><b>Area</b>Hold to place a circle, release to land it.</span></button>
              <button class="sk" type="button" data-k="dash" aria-describedby="lgb-tip3"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h12M12 6l6 6-6 6" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg><kbd>E</kbd><span class="tip" id="lgb-tip3" role="tooltip"><b>Dash</b>Hold to pick a direction, release to go.</span></button>
            </div>
          </div>
          <p class="cap-note">The practice pad is an illustration of the controls, not the game. Keys: hold Q, W or E (or Space on a focused button), then release.</p>
        </div>
      </div>
    </div>
  </section>

  <section class="leg" data-side="R" aria-labelledby="lgb-h-team">
    ${tower(2)}
    <div class="content">
      ${label("2", "Dog tower 2 · team fights")}
      <div class="duo">
        <figure class="scout rv" data-depth=".06">
          <span class="rec">In game</span>
          <img src="${sized(A.teamfight, 720)}" srcset="${srcset(A.teamfight, 720, 1000)}" sizes="(max-width:1100px) 92vw, 560px" alt="In-game screenshot: the cat heroes Sage, Clem and Bengas fight on a lane as a blue dog tower takes a hit." width="1000" height="563" loading="lazy" decoding="async">
          <figcaption>Sage, Clem and Bengas hit a dog tower.</figcaption>
        </figure>
        <div class="card">
          <h2 class="kin" id="lgb-h-team">${T} of you. <span class="dog">${T} of them.</span></h2>
          <p class="lede rv">Every match is ${F.teamSize}v${F.teamSize}. Walk the lanes with your minions, pick fights at the towers, and pile in together when it counts.</p>
          <div class="vs3 rv" aria-hidden="true">
            <span class="team">${ourTeam.map((h) => `<span><img src="${tile(h)}" alt="" width="280" height="383" loading="lazy" decoding="async"></span>`).join("")}</span>
            <b>vs</b>
            <span class="team d">${theirTeam.map((h) => `<span><img src="${tile(h)}" alt="" width="280" height="383" loading="lazy" decoding="async"></span>`).join("")}</span>
          </div>
          <p class="lede rv">Play solo, or open a party and bring up to ${countWord(friends).toLowerCase()} friends: send the link or the ${F.roomCodeLength}-character room code. No account, no install. Bots fill every open seat, and if someone drops, a bot plays their hero until they&#8217;re back.</p>
          <p class="note rv">Co-op against bots: there is no PvP.</p>
        </div>
      </div>
    </div>
  </section>

  <div class="river" id="river" aria-hidden="true">
    <div class="water"><div class="rip b"></div><div class="rip a"></div></div>
    <svg class="rtext" id="rtext" preserveAspectRatio="none"><defs><path id="lgb-rpath" d=""/></defs><text><textPath href="#lgb-rpath" id="rtp"><tspan id="rts">${"LANES · TOWERS · TEAM FIGHTS · ".repeat(5).trim()}</tspan></textPath></text></svg>
    <div class="bridge" id="bridge"></div>
    <p class="maplabel rlabel">Mid · the river</p>
  </div>

  <section class="leg" data-side="R" aria-labelledby="lgb-h-roster">
    ${tower(3)}
    <div class="content">
      ${label("3", "Dog tower 3 · the roster")}
      <div class="card">
        <div class="roster-head">
          <div><h2 class="kin" id="lgb-h-roster">${countWord(live.length)} legends, <em>live now.</em></h2>
          <p class="lede rv" style="margin:0">${countWord(cats.length)} cats and ${countWord(dogs.length).toLowerCase()} dogs across ${countWord(roles.length).toLowerCase()} roles. Pick one, learn the kit, take it down the lane.</p></div>
          <div class="chips rv" role="group" aria-label="Filter heroes by role">
            <button class="chip" type="button" data-r="all" aria-pressed="true">All ${grid.length}</button>
            ${roles.map((r) => `<button class="chip" type="button" data-r="${r}" aria-pressed="false">${r}</button>`).join("\n            ")}
          </div>
        </div>
        <ul class="grid" id="grid" role="list">
          ${grid.map((h, i) => card(h, i, fresh.has(h.id))).join("\n          ")}
        </ul>
        ${comingNext(newcomers())}
      </div>
    </div>
  </section>

  <section class="leg" data-side="L" aria-labelledby="lgb-h-short">
    ${tower(4)}
    <div class="content">
      ${label("4", "Dog tower 4 · pick up and play")}
      <div class="duo">
        <div class="card">
          <h2 class="kin" id="lgb-h-short">Short matches. <em>Any screen.</em></h2>
          <p class="lede rv">Open a tab on your laptop or your phone and you&#8217;re in. Nothing to install, and a match is over in ${F.matchCapMinutes} minutes at most.</p>
          <ul class="facts rv">
            <li><span>1</span>Plays in the browser, free</li>
            <li><span>2</span>Desktop and phone</li>
            <li><span>3</span>Zoom the camera: wheel or +/&#8722;, pinch on a phone</li>
          </ul>
        </div>
        <div class="devices rv">
          <div class="browser" data-depth=".05"><div class="bar"><i></i><i></i><i></i><span>tokentails.com/pawlegends/play</span></div><img src="${sized(A.desktop, 720)}" srcset="${srcset(A.desktop, 720, 960)}" sizes="(max-width:760px) 60vw, 560px" alt="Desktop browser showing a match start: a cat hero at the start of a match, with the skill bar along the bottom of the screen." width="960" height="540" loading="lazy" decoding="async"></div>
          <div class="phone" data-depth="-.08"><img src="${A.phone}" alt="Phone screenshot: cat heroes clash with dogs at the blue base." width="420" height="747" loading="lazy" decoding="async"></div>
        </div>
      </div>
    </div>
  </section>

${shelterSection(champions)}

  <section class="leg final" id="play" data-side="R" aria-labelledby="lgb-h-final">
    <div class="lanecol">
      <div class="anchor" data-a="dog-base">
        <div class="camwrap">
        <div class="plaza dog" aria-hidden="true">
          <span class="flag" style="left:16%;top:14%"></span><span class="flag" style="left:80%;top:12%"></span>
          <span class="flag" style="left:10%;top:70%"></span><span class="flag" style="left:86%;top:68%"></span>
          <div class="nexus"><svg viewBox="0 0 120 110">
            <ellipse cx="62" cy="100" rx="46" ry="9" fill="#132a66" opacity=".4"/>
            <g class="debris"><path d="M24 98l8-12 12 4 4 8zM50 99l6-14 14-2 8 16zM80 98l4-9 12 1 2 8z" fill="#2f57c9" stroke="#0d1d4a" stroke-width="3" stroke-linejoin="round"/><path d="M40 92l6-6 8 3-2 7zM70 90l7-3 4 6-5 4z" fill="#ffc83d" stroke="#6b4a07" stroke-width="2.5" stroke-linejoin="round"/><g transform="translate(58 34)"><rect x="-2" y="0" width="4" height="52" rx="2" fill="#6b4b35"/><path d="M2 0l26 5-8 8 8 8-26 4z" fill="#ec5a8d" stroke="#8a1f47" stroke-width="2" stroke-linejoin="round"/></g></g>
            <g class="house"><g class="hov"><path d="M16 52 60 16l44 36v44H16z" fill="#2f57c9" stroke="#0d1d4a" stroke-width="4" stroke-linejoin="round"/><path d="M8 56 60 12l52 44" fill="none" stroke="#132a66" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/><path d="M46 96V70a14 14 0 0 1 28 0v26z" fill="#0d1d4a"/><g transform="translate(60 44)"><rect x="-14" y="-4" width="28" height="8" rx="4" fill="#ffc83d" stroke="#6b4a07" stroke-width="2.5"/><circle cx="-14" cy="-4" r="5" fill="#ffc83d" stroke="#6b4a07" stroke-width="2.5"/><circle cx="-14" cy="4" r="5" fill="#ffc83d" stroke="#6b4a07" stroke-width="2.5"/><circle cx="14" cy="-4" r="5" fill="#ffc83d" stroke="#6b4a07" stroke-width="2.5"/><circle cx="14" cy="4" r="5" fill="#ffc83d" stroke="#6b4a07" stroke-width="2.5"/></g>
              <g class="crack"><path d="M60 18l-6 14 8 6-10 12"/><path d="M30 60l10 4 4 12-6 10"/><path d="M84 58l-6 10 6 10-4 16"/><path d="M52 50l-12 4-10 6"/><path d="M68 54l16 4 20-6"/></g></g></g>
            <g class="shards"><path d="M16 52 60 16 52 50 30 60z" fill="#3d68dd" stroke="#0d1d4a" stroke-width="3" stroke-linejoin="round"/><path d="M60 16 104 52 84 58 52 50z" fill="#2f57c9" stroke="#0d1d4a" stroke-width="3" stroke-linejoin="round"/><path d="M16 52 30 60 40 96 16 96z" fill="#2f57c9" stroke="#0d1d4a" stroke-width="3" stroke-linejoin="round"/><path d="M30 60 52 50 84 58 70 96 40 96z" fill="#284fb8" stroke="#0d1d4a" stroke-width="3" stroke-linejoin="round"/><path d="M84 58 104 52 104 96 70 96z" fill="#3d68dd" stroke="#0d1d4a" stroke-width="3" stroke-linejoin="round"/><path d="M8 56 60 12" fill="none" stroke="#132a66" stroke-width="10" stroke-linecap="round"/><path d="M60 12l52 44" fill="none" stroke="#132a66" stroke-width="10" stroke-linecap="round"/></g>
          </svg>
            <div class="base-hp"><s></s><i></i></div></div>
          <div class="victory" aria-hidden="true"><span class="vl">VICTORY</span><span class="shine">VICTORY</span></div>
        </div>
        </div>
      </div>
    </div>
    <div class="content">
      ${label("!", "Enemy base · dog side")}
      <h2 class="kin" id="lgb-h-final">Break the core.</h2>
      <p class="tag">The road ends here. The match starts in your browser.</p>
      <div class="ctas">
        <span class="cta-wrap"><i class="ring"></i><i class="ring"></i>${play(LEGENDS_CTA.final, "legends_final", "Play free in your browser")}</span>
        <a class="btn ghost" href="/">Visit Token Tails</a>
      </div>
      <p class="small">Free · desktop and phone · ${F.teamSize}v${F.teamSize}, solo or with up to ${countWord(friends).toLowerCase()} friends, against bots. No PvP.</p>
    </div>
  </section>

  <footer class="foot">
    <div class="in">
      <img src="${sized(A.logo, 244)}" srcset="${srcset(A.logo, 244, 420)}" sizes="150px" alt="Token Tails" width="420" height="236" loading="lazy" decoding="async">
      <p>Pawlegends is a free ${F.teamSize}v${F.teamSize} cats vs dogs game by Token Tails, a cat game studio.</p>
      <nav aria-label="Footer"><a href="${LEGENDS_CTA.footer}" data-cta="legends_footer">Play Pawlegends</a><a href="${PAWLEGENDS_TERMS_PATH}">Terms</a><a href="/">Token Tails</a><a href="#top">Back to top</a></nav>
    </div>
  </footer>
</div>
</div>

<button class="mini" id="mini" type="button" aria-label="Lane minimap. Click to jump along the lane.">
  <span class="mm" id="mm"><svg id="mmsvg" preserveAspectRatio="none" aria-hidden="true"><path/></svg><span class="tr"></span><span class="tr"></span><span class="tr"></span><span class="tr"></span><span class="tr"></span><span class="me" id="me"></span></span>
</button>`;
}
