/**
 * The Pawlegends landing markup: a port of the vs-screen landing (docs/plans/moba/landings/02-vs-screen.html) with
 * the content brought up to date (party play, 17 heroes, Fish/Toys/levels). It is one HTML string that the page
 * renders under `.pll`; `motion.js` animates it in place, so React never re-renders inside it.
 *
 * Copy rules: no player counts, no ratings, no claims about features that are not in the game. The roster numbers
 * come from roster.ts, never from literals.
 */
import { countWord, landingCats, landingDogs, LANDING_ROSTER, rolesOf, type LandingHero } from "./roster";
import { playHref } from "../routes";
import { PAWLEGENDS_TERMS_PATH } from "../flags";

export const LANDING_ASSET = (name: string) => `/pawlegends/landing/${name}`;
const A = {
  spriteLambo: LANDING_ASSET("sprite-lambo.b51daf72.webp"),
  spriteBrutus: LANDING_ASSET("sprite-brutus.cde07f7a.webp"),
  map: LANDING_ASSET("shot-map.676fac5b.webp"),
  aim: LANDING_ASSET("shot-aim.2a268c6c.webp"),
  teamfight: LANDING_ASSET("shot-teamfight.1be7757e.webp"),
  phone: LANDING_ASSET("shot-phone.24bce0a7.webp"),
  logo: LANDING_ASSET("tt-logo.19b6c796.webp"),
  fredoka: LANDING_ASSET("fredoka.218d0e8a.woff2"),
  mascot: LANDING_ASSET("mascot.92c3f404.webp"),
  mascot2: LANDING_ASSET("mascot2.ff449081.webp"),
};
/** Fredoka (OFL, LICENSE-fredoka.txt next to it): the game's UI face, the whole font so ė draws from it. */
export const LANDING_FONT = A.fredoka;
/** Every file the landing loads from public/ (the unit test checks they exist). */
export const LANDING_FILES: readonly string[] = Object.freeze([
  ...Object.values(A),
  ...LANDING_ROSTER.map((h) => h.portrait).filter((p): p is string => !!p),
]);

export const HERO_CTA_HREF = playHref("landing_hero");
export const CONTINUE_CTA_HREF = playHref("landing_continue");

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** Fredoka has no precomposed ė but has the combining dot, so names are written decomposed (as the game does). */
const shown = (name: string) => esc(name.normalize("NFD"));
const hero = (id: string): LandingHero => {
  const h = LANDING_ROSTER.find((x) => x.id === id);
  if (!h) throw new Error(`landing: unknown hero ${id}`);
  return h;
};
const sideWord = (h: LandingHero) => (h.side === "cat" ? "cat" : "dog");
const altOf = (h: LandingHero) => `${h.name}, ${sideWord(h)} ${h.role.toLowerCase()}`;
const longName = (name: string) => name.length > 9;

/** A paw print, for heroes whose in-game art is not out yet. */
const PAW_SVG =
  '<svg viewBox="-30 -30 60 60" aria-hidden="true"><ellipse cx="0" cy="8" rx="15" ry="12.5"/><circle cx="-16" cy="-6" r="6.4"/><circle cx="-5.6" cy="-16.5" r="6.4"/><circle cx="5.6" cy="-16.5" r="6.4"/><circle cx="16" cy="-6" r="6.4"/></svg>';

function tile(h: LandingHero, pressed: boolean): string {
  const art = h.portrait
    ? `<img src="${h.portrait}" alt="" width="420" height="574" loading="lazy" decoding="async">`
    : `<span class="sil">${PAW_SVG}</span>`;
  return (
    `<li class="${h.side}"><button class="tile ${h.side}" type="button" data-side="${h.side}" data-id="${h.id}" data-name="${shown(h.name)}"` +
    ` data-role="${h.role}" data-breed="${esc(h.breed ?? "")}" data-blurb="${esc(h.blurb)}" data-portrait="${h.portrait ?? ""}" aria-pressed="${pressed}">` +
    `<span class="in">${art}</span>${h.portrait ? "" : '<span class="new" aria-hidden="true">New</span>'}` +
    `<span class="nm">${shown(h.name)}</span><span class="cur" aria-hidden="true"><b>${h.side === "cat" ? "1P" : "2P"}</b></span>` +
    `<span class="sr">${esc(altOf(h))}${h.portrait ? "" : ", new"}</span></button></li>`
  );
}

function slot(h: LandingHero): string {
  const isCat = h.side === "cat";
  return `<div class="slot ${h.side}${h.portrait ? "" : " is-sil"}" id="slot-${h.side}" aria-live="polite">
        <div class="bg ${isCat ? "halftone-pink" : "halftone-blue"}"></div><div class="rays" aria-hidden="true"></div><div class="vig" aria-hidden="true"></div>
        <div class="pic"><img src="${h.portrait ?? ""}" alt="${esc(altOf(h))}" width="420" height="574" loading="lazy" decoding="async"></div>
        <div class="sil" aria-hidden="true">${PAW_SVG}<b>New champion</b></div>
        <div class="imp" aria-hidden="true"></div>
        <canvas class="lines" aria-hidden="true"></canvas>
        <div class="who"><span class="pl">${isCat ? "P1 · Cat" : "P2 · Dog"}</span><div class="disp name${longName(h.name) ? " long" : ""}"><span class="ital">${shown(h.name)}</span></div><div class="role">${h.role}</div><div class="breed">${esc(h.breed ?? "")}</div><p class="blurb">${esc(h.blurb)}</p></div>
        <div class="ready" aria-hidden="true">Ready!</div>
      </div>`;
}

/**
 * The party round's drawing: an invite link, your team of three in blue, three bots in red. Not a screenshot.
 * Everything sits inside x 100..860 so the round's Ken Burns zoom (up to 1.14 and a 3% pan) never crops it.
 */
function squadSvg(): string {
  const team = [
    { h: hero("clem"), label: "You" },
    { h: hero("sage"), label: "Friend" },
    { h: hero("lambo"), label: "Friend" },
  ];
  const W = 104,
    H = 146,
    GAP = 12,
    Y = 178;
  const card = (x: number, inner: string, fill: string, label: string, lfill: string) =>
    `<g transform="translate(${x} ${Y})"><g class="card"><rect width="${W}" height="${H}" rx="11" fill="${fill}" stroke="#12091f" stroke-width="5"/>${inner}` +
    `<rect x="-4" y="${H + 12}" width="${W + 8}" height="34" rx="7" fill="${lfill}" stroke="#12091f" stroke-width="4"/>` +
    `<text x="${W / 2}" y="${H + 36}" text-anchor="middle" font-size="19" fill="#12091f" class="lbl">${label.toUpperCase()}</text></g></g>`;
  const ours = team
    .map((t, i) => {
      const inner =
        `<clipPath id="pll-sq-c${i}"><rect x="3" y="3" width="${W - 6}" height="${H - 6}" rx="8"/></clipPath>` +
        `<image href="${t.h.portrait}" x="-20" y="-4" width="${W + 40}" height="${Math.round((W + 40) * (574 / 420))}" preserveAspectRatio="xMidYMin slice" clip-path="url(#pll-sq-c${i})"/>`;
      return card(100 + i * (W + GAP), inner, "#2f6bff", t.label, "#d6e5ff");
    })
    .join("");
  const bot =
    `<g transform="translate(${W / 2} 74) scale(.85)" fill="#fff3e3" stroke="#12091f" stroke-width="4"><line x1="0" y1="-46" x2="0" y2="-30"/><circle cx="0" cy="-50" r="7" fill="#fff04d"/>` +
    '<rect x="-38" y="-30" width="76" height="60" rx="14"/><circle cx="-15" cy="-2" r="8" fill="#12091f"/><circle cx="15" cy="-2" r="8" fill="#12091f"/><rect x="-14" y="16" width="28" height="6" rx="3" fill="#12091f" stroke="none"/></g>';
  const theirs = [0, 1, 2].map((i) => card(524 + i * (W + GAP), bot, "#e8344a", "Bot", "#ffd0d6")).join("");
  return `<svg class="sq" viewBox="0 0 960 540" role="img" aria-label="Illustration: an invite link at the top; below it your team of three, you and two friends in blue, against three bots in red">
          <defs><pattern id="pll-sq-dots" width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="8" cy="8" r="2.2" fill="rgba(255,255,255,.08)"/></pattern></defs>
          <rect width="960" height="540" fill="#0b1d52"/><rect width="960" height="540" fill="url(#pll-sq-dots)"/>
          <rect x="0" y="150" width="480" height="390" fill="rgba(47,107,255,.18)"/><rect x="480" y="150" width="480" height="390" fill="rgba(232,52,74,.16)"/>
          <g class="chip"><rect x="140" y="50" width="680" height="64" rx="32" fill="#fff" stroke="#12091f" stroke-width="5"/>
            <g transform="translate(182 82)" fill="none" stroke="#2f6bff" stroke-width="6" stroke-linecap="round"><path d="M-4,6 L6,-4"/><path d="M-10,0 l-4,4 a8,8 0 0 0 11,11 l4,-4"/><path d="M10,0 l4,-4 a8,8 0 0 0 -11,-11 l-4,4"/></g>
            <text x="210" y="92" font-size="25" fill="#12091f" class="url">tokentails.com/pawlegends?party=<tspan fill="#2f6bff" class="code">K7QX2M</tspan></text></g>
          <circle class="tapdot" cx="770" cy="82" r="22" fill="none" stroke="#fff04d" stroke-width="5" opacity="0"/>
          ${ours}
          <text x="480" y="${Y + H / 2 + 18}" text-anchor="middle" font-size="44" fill="#fff04d" stroke="#12091f" stroke-width="6" paint-order="stroke" class="vsx">VS</text>
          ${theirs}
          <text x="480" y="440" text-anchor="middle" font-size="22" fill="rgba(255,255,255,.78)" class="cap">Bots fill every open seat</text>
        </svg>`;
}

/**
 * The shelter section, its own copy unit. It names the shelter champions (real Pink Paw cats, the game's
 * data/heroes/shelter.ts) and makes no money or impact claim: a share of a sale needs a facts-registry id first
 * (docs/CLAIMS.md, copy-lint R2).
 */
function shelterSection(champions: LandingHero[]): string {
  const names = champions.map((h) => shown(h.name)).join(", ").replace(/, ([^,]*)$/, " and $1");
  return `<section class="shelter" aria-labelledby="sh-h">
  <div class="stripes" aria-hidden="true"></div>
  <div class="wrap">
    <div class="belt">
      <div class="belt-in">
        <div class="disc" aria-hidden="true"></div>
        <img src="${A.logo}" alt="Token Tails logo" width="420" height="236" loading="lazy" decoding="async">
        <div class="split" aria-hidden="true"><div><b>${champions.length}</b><small>Pink Paw cats</small></div></div>
      </div>
      <canvas aria-hidden="true"></canvas>
    </div>
    <div>
      <p class="kicker">The real title belt</p>
      <h2 class="disp" id="sh-h"><span class="ital">Cats win off the map too</span></h2>
      <p>Pawlegends is made by <strong>Token Tails</strong>, a cat game studio. ${names} are real cats from the <strong>Pink Paw</strong> shelter, drawn as heroes.</p>
      <div class="ctas"><span class="mag"><a class="btn ghost" href="/"><span>Visit Token Tails <span class="arrow" aria-hidden="true">&#9654;</span></span></a></span></div>
    </div>
  </div>
  <div class="dotband" aria-hidden="true" style="--c:#000"><i></i><i></i><i></i><i></i></div>
</section>`;
}

export function landingMarkup(): string {
  const cats = landingCats();
  const dogs = landingDogs();
  const total = LANDING_ROSTER.length;
  const catRoles = rolesOf("cat");
  const dogRoles = rolesOf("dog");
  const lambo = hero("lambo");
  const brutus = hero("brutus");
  /** The shelter champions (the game's data/heroes/shelter.ts SHELTER_CHAMPIONS): real Pink Paw cats. */
  const champions = ["lambo", "aviete", "bengas", "gabe"].map(hero);
  const t1 = ["Free to play", "In your browser", "Desktop + phone", "3v3", "Play with friends"];
  const t2 = ["Hold to aim", "Lanes", "Towers", "Fish and Toys", `${total} heroes`];
  const tape = (words: string[]) => [0, 1, 2].map(() => words.map((w) => `<span>${esc(w)}</span>`).join("")).join("");
  const bar = (n: number, of: number) => (n / of).toFixed(3).replace(/\.?0+$/, "") || "0";
  const maxSide = Math.max(cats.length, dogs.length);

  return `<a class="skip" href="#select">Skip to hero select</a>
<div class="cursor" aria-hidden="true"><svg viewBox="-23 -23 46 46">
  <circle class="rtrk" r="19"/><circle class="rfill" r="19" pathLength="1" transform="rotate(-90)"/>
  <g class="paw"><ellipse cx="0" cy="4" rx="6.2" ry="5.2"/><circle cx="-6.6" cy="-3.2" r="2.6"/><circle cx="-2.3" cy="-7.2" r="2.6"/><circle cx="2.3" cy="-7.2" r="2.6"/><circle cx="6.6" cy="-3.2" r="2.6"/></g>
</svg></div>

<header class="hero" id="top">
  <div class="hero-shake">
    <div class="side cat" aria-hidden="true"><div class="tone"><i class="halftone-pink"></i></div><div class="glow"></div><div class="bigword">Cats</div></div>
    <div class="side dog" aria-hidden="true"><div class="tone"><i class="halftone-blue"></i></div><div class="glow"></div><div class="bigword">Dogs</div></div>
    <canvas id="seam" aria-hidden="true"></canvas>
    <div class="hud" aria-hidden="true">
      <div class="bar cat"><i></i><b>P1 · Cats</b></div>
      <div class="timer">FREE<small>TO PLAY</small></div>
      <div class="bar dog"><i></i><b>Dogs · P2</b></div>
    </div>
    <figure class="fighter cat">
      <div class="par">
        <div class="frame"><div class="rays"></div><div class="puppet"><img class="still" src="${lambo.portrait}" alt="Lambo, a grey cat tank with a round shield and a pink collar" width="420" height="574" fetchpriority="high"><canvas class="sprite" aria-hidden="true" data-src="${A.spriteLambo}"></canvas></div></div>
        <figcaption class="tag">Lambo<em>Cat · Tank</em></figcaption>
      </div>
    </figure>
    <figure class="fighter dog">
      <div class="par">
        <div class="frame"><div class="rays"></div><div class="puppet"><img class="still" src="${brutus.portrait}" alt="Sir Brutus, a dog tank in a steel helmet with a sword and shield" width="420" height="574" fetchpriority="high"><canvas class="sprite" aria-hidden="true" data-src="${A.spriteBrutus}"></canvas></div></div>
        <figcaption class="tag">Sir Brutus<em>Dog · Tank</em></figcaption>
      </div>
    </figure>
    <div class="vs" aria-hidden="true"><div class="vs-par"><span class="vs-ring"></span><span class="vs-ghost p">VS</span><span class="vs-ghost b">VS</span><span class="vs-word">VS</span></div></div>
    <div class="announcer" aria-hidden="true">Fight!</div>
    <div class="hero-copy">
      <h1 class="logo" aria-label="Pawlegends"><span class="paw-c" aria-hidden="true"><span class="ch">P</span><span class="ch">a</span><span class="ch">w</span></span><span class="leg-c" aria-hidden="true"><span class="ch">l</span><span class="ch">e</span><span class="ch">g</span><span class="ch">e</span><span class="ch">n</span><span class="ch">d</span><span class="ch">s</span></span></h1>
      <p class="sub">Cats vs dogs, three on three. Play solo or bring two friends. Free, right in your browser on desktop or phone.</p>
      <div class="ctas">
        <span class="mag"><a class="btn big" href="${HERO_CTA_HREF}" data-cta="landing_hero"><span>Play free in your browser <span class="arrow" aria-hidden="true">&#9654;</span></span></a></span>
      </div>
    </div>
    <div class="scroll-cue" aria-hidden="true">SCROLL</div>
  </div>
  <svg class="slash" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="M-5,50 L105,50 L105,50 L-5,50 Z" opacity="0"/></svg>
  <div class="flash" aria-hidden="true"></div>
</header>

<div class="pll-main">
<section class="select" id="select" aria-labelledby="sel-h">
  <div class="scan" aria-hidden="true"></div>
  <div class="sel-edge" aria-hidden="true"></div>
  <div class="wrap">
    <div class="select-head">
      <p class="kicker"><span class="live">${total} heroes live</span></p>
      <h2 class="disp h2" id="sel-h"><span class="ital"><span class="w">Choose</span> <span class="w">your</span> <span class="w">legend</span></span></h2>
      <p class="lede">${countWord(cats.length)} cats, ${countWord(dogs.length).toLowerCase()} dogs. Pick a side, hover a hero to throw them into the ring, click to lock them in.</p>
    </div>
    <div class="stage" id="stage">
      ${slot(hero("clem"))}
      <div class="grid-wrap">
        <div class="stage-vs" aria-hidden="true"><span>VS</span></div>
        <div class="side-switch" role="group" aria-label="Show cats or dogs">
          <button type="button" class="cat" data-show="cat" aria-pressed="true"><span>Cats<small>· ${cats.length}</small></span></button>
          <button type="button" class="dog" data-show="dog" aria-pressed="false"><span>Dogs<small>· ${dogs.length}</small></span></button>
        </div>
        <ul class="grid" role="list" data-show="cat">
          ${cats.map((h) => tile(h, h.id === "clem")).join("\n          ")}
          ${dogs.map((h) => tile(h, h.id === "brutus")).join("\n          ")}
        </ul>
        <p class="pick-bio" aria-hidden="true"><b>Clem</b> <span class="meta">· Fighter</span><br><span class="txt">${esc(hero("clem").blurb)}</span></p>
      </div>
      ${slot(brutus)}
    </div>
    <p class="hint">Every match is <b>3v3 against bots</b>, solo or with up to two friends on your team. No PvP yet.</p>
  </div>
  <div class="dotband" aria-hidden="true" style="--c:var(--cream)"><i></i><i></i><i></i><i></i></div>
</section>

<section class="rounds" id="rounds" aria-label="How a match plays">
  <article class="round" data-r="1">
    <div class="stripes"></div>
    <svg class="num" viewBox="0 0 100 100" aria-hidden="true"><text x="50" y="92" text-anchor="middle">1</text></svg>
    <div class="wrap">
      <div class="shot"><div class="kb"><img src="${A.map}" alt="Top-down view of the Pawlegends map: a pink cat base on the left, a blue dog base on the right, lanes looping between them across a river" width="1200" height="675" loading="lazy" decoding="async">
        <svg class="ov ov1" viewBox="0 0 1200 675" aria-hidden="true">
          <circle class="base c" cx="168" cy="318" r="62"/><circle class="base d" cx="1032" cy="330" r="62"/>
          <path class="lane-ink" d="M168,300 C140,220 200,150 310,146 L890,146 C970,150 1010,220 1032,312"/>
          <path class="lane" d="M168,300 C140,220 200,150 310,146 L890,146 C970,150 1010,220 1032,312"/>
          <g class="pawm" transform="translate(1032 312)"><circle r="30"/><g transform="rotate(90)"><ellipse class="pad" cx="0" cy="5" rx="11" ry="9"/><circle class="pad" cx="-11" cy="-6" r="4.6"/><circle class="pad" cx="-4" cy="-12" r="4.6"/><circle class="pad" cx="4" cy="-12" r="4.6"/><circle class="pad" cx="11" cy="-6" r="4.6"/></g></g>
        </svg></div></div>
      <div class="txt">
        <span class="banner">Round 1</span>
        <h3 class="disp"><span class="ital">Push the lane</span></h3>
        <p>Lanes run from your base to theirs, guarded by towers. Farm minions and take down heroes to earn Fish and level up, then spend your Fish on Toys mid-match.</p>
        <ul class="chips"><li>Lanes</li><li>Towers</li><li>Fish</li><li>Toys</li><li>Levels</li></ul>
      </div>
    </div>
  </article>
  <article class="round" data-r="2">
    <div class="stripes"></div><div class="zap" aria-hidden="true"></div>
    <svg class="num" viewBox="0 0 100 100" aria-hidden="true"><text x="50" y="92" text-anchor="middle">2</text></svg>
    <div class="wrap">
      <div class="shot"><div class="kb"><img src="${A.aim}" alt="A cat hero at the start of a match, with the skill bar along the bottom of the screen and a hint saying run to the lane" width="960" height="540" loading="lazy" decoding="async">
        <svg class="ov ov2" viewBox="0 0 960 540" aria-hidden="true">
          <circle class="holdt" cx="355" cy="226" r="46"/><circle class="hold" cx="355" cy="226" r="46" pathLength="1" stroke-dasharray="1" stroke-dashoffset="0" transform="rotate(-90 355 226)"/>
          <g transform="translate(355 226) rotate(-14)">
            <g class="aim"><rect class="aimbar" x="52" y="-10" width="250" height="20" rx="10"/><path class="aimhead" d="M296,-28 L346,0 L296,28 Z"/></g>
            <circle class="proj" cx="60" cy="0" r="15"/><circle class="boom" cx="400" cy="0" r="26"/>
          </g>
        </svg></div></div>
      <div class="txt">
        <span class="banner">Round 2</span>
        <h3 class="disp"><span class="ital">Hold to aim</span></h3>
        <p>Hold a skill to aim it, let go to fire. Every skill has a tooltip, so you learn a hero by playing it.</p>
        <ul class="chips"><li>Hold-to-aim skills</li><li>Tooltips</li></ul>
      </div>
    </div>
  </article>
  <article class="round" data-r="3">
    <div class="stripes"></div><div class="zap" aria-hidden="true"></div>
    <svg class="num" viewBox="0 0 100 100" aria-hidden="true"><text x="50" y="92" text-anchor="middle">3</text></svg>
    <div class="wrap">
      <div class="shot"><div class="kb"><img src="${A.teamfight}" alt="Cat heroes Sage, Clem and Bengas fight on a lane as a dog tower takes a hit" width="1000" height="563" loading="lazy" decoding="async">
        <svg class="ov ov3" viewBox="0 0 1000 563" aria-hidden="true">
          <path class="star" transform="translate(500 290)" d="M0,-52 L13,-17 L50,-16 L21,7 L31,42 L0,22 L-31,42 L-21,7 L-50,-16 L-13,-17 Z"/>
          <path class="star" transform="translate(770 322) scale(.85)" d="M0,-52 L13,-17 L50,-16 L21,7 L31,42 L0,22 L-31,42 L-21,7 L-50,-16 L-13,-17 Z"/>
          <path class="star" transform="translate(368 392) scale(.7)" d="M0,-52 L13,-17 L50,-16 L21,7 L31,42 L0,22 L-31,42 L-21,7 L-50,-16 L-13,-17 Z"/>
        </svg></div></div>
      <div class="txt">
        <span class="banner">Round 3</span>
        <h3 class="disp"><span class="ital">Team fight</span></h3>
        <p>Three on three. Line up your skills with your team and win the fight together. Your team shows blue, theirs red.</p>
        <ul class="chips"><li>3v3</li><li>Team fights</li><li>Short matches</li></ul>
      </div>
    </div>
  </article>
  <article class="round" data-r="4">
    <div class="stripes"></div><div class="zap" aria-hidden="true"></div>
    <svg class="num" viewBox="0 0 100 100" aria-hidden="true"><text x="50" y="92" text-anchor="middle">4</text></svg>
    <div class="wrap">
      <div class="shot"><div class="kb">${squadSvg()}</div><span class="ill" aria-hidden="true">Illustration</span></div>
      <div class="txt">
        <span class="banner">Round 4</span>
        <h3 class="disp"><span class="ital">Squad up</span></h3>
        <p>Send a link. Your friends tap it and pick a hero: no account, no install. Up to three of you on one team against bots. If someone drops, a full-strength bot holds their hero until they're back, and the party stays together for the next match.</p>
        <ul class="chips"><li>Invite link</li><li>No account needed</li><li>Bot covers drops</li><li>Play again together</li></ul>
        <p class="small">Pings, quick chat and emotes. No open chat.</p>
      </div>
    </div>
  </article>
  <article class="round" data-r="5">
    <div class="stripes"></div><div class="zap" aria-hidden="true"></div>
    <svg class="num" viewBox="0 0 100 100" aria-hidden="true"><text x="50" y="92" text-anchor="middle">5</text></svg>
    <div class="wrap">
      <div class="shot tall"><div class="kb"><img src="${A.phone}" alt="Pawlegends on a phone in portrait: cat heroes clash with dogs at the blue base" width="420" height="747" loading="lazy" decoding="async">
        <svg class="ov ov4" viewBox="0 0 420 747" aria-hidden="true"><circle class="tap" cx="236" cy="430" r="40"/><circle class="tap" cx="236" cy="430" r="40"/></svg></div></div>
      <div class="txt">
        <span class="banner">Final round</span>
        <h3 class="disp"><span class="ital">Anywhere</span></h3>
        <p>It runs in the browser on desktop and on your phone. Open the link and you are in a match. Nothing to install, free to play.</p>
        <ul class="chips"><li>Browser</li><li>Desktop</li><li>Phone</li><li>Free</li></ul>
      </div>
    </div>
  </article>
  <div class="pips" aria-hidden="true"><i class="on"></i><i></i><i></i><i></i><i></i></div>
</section>

<div class="tapes" aria-hidden="true">
  <div class="tape t1"><div class="row">${tape(t1)}</div></div>
  <div class="tape t2"><div class="row">${tape(t2)}</div></div>
</div>

<section class="tale" aria-labelledby="tale-h">
  <div class="wrap">
    <div class="tale-head">
      <p class="kicker">Tale of the tape</p>
      <h2 class="disp h2" id="tale-h"><span class="ital"><span class="w">Know</span> <span class="w">the</span> <span class="w">matchup</span></span></h2>
    </div>
    <div class="tale-card" role="table" aria-label="Cats and dogs compared">
      <div class="tale-row" role="row"><div class="l" role="cell"><span class="val" data-count="${cats.length}">${cats.length}</span><span class="note">cat heroes</span><i class="tb" style="--v:${bar(cats.length, maxSide)}" aria-hidden="true"></i></div><div class="m" role="rowheader"><span>Heroes live</span></div><div class="r" role="cell"><span class="val" data-count="${dogs.length}">${dogs.length}</span><span class="note">dog heroes</span><i class="tb" style="--v:${bar(dogs.length, maxSide)}" aria-hidden="true"></i></div></div>
      <div class="tale-row" role="row"><div class="l" role="cell"><span class="val" data-count="${catRoles.length}">${catRoles.length}</span><span class="note">${catRoles.join(", ")}</span><i class="tb" style="--v:${bar(catRoles.length, 6)}" aria-hidden="true"></i></div><div class="m" role="rowheader"><span>Roles</span></div><div class="r" role="cell"><span class="val" data-count="${dogRoles.length}">${dogRoles.length}</span><span class="note">${dogRoles.join(", ")}</span><i class="tb" style="--v:${bar(dogRoles.length, 6)}" aria-hidden="true"></i></div></div>
      <div class="tale-row" role="row"><div class="l" role="cell"><span class="val" data-count="3">3</span><span class="note">per team</span><i class="tb" style="--v:1" aria-hidden="true"></i></div><div class="m" role="rowheader"><span>Team size</span></div><div class="r" role="cell"><span class="val" data-count="3">3</span><span class="note">per team</span><i class="tb" style="--v:1" aria-hidden="true"></i></div></div>
      <div class="tale-row" role="row"><div class="l" role="cell"><span class="val">1–3</span><span class="note">players, bots fill the rest</span><i class="tb" style="--v:1" aria-hidden="true"></i></div><div class="m" role="rowheader"><span>Squad</span></div><div class="r" role="cell"><span class="val">1–3</span><span class="note">players, bots fill the rest</span><i class="tb" style="--v:1" aria-hidden="true"></i></div></div>
      <div class="tale-row" role="row"><div class="l" role="cell"><span class="val">Free</span><span class="note">browser, desktop + phone</span><i class="tb" style="--v:1" aria-hidden="true"></i></div><div class="m" role="rowheader"><span>Price</span></div><div class="r" role="cell"><span class="val">Free</span><span class="note">browser, desktop + phone</span><i class="tb" style="--v:1" aria-hidden="true"></i></div></div>
    </div>
    <p class="tale-foot">Every match is your team against bots. Bring up to two friends; PvP is not live yet.</p>
  </div>
  <div class="dotband" aria-hidden="true" style="--c:var(--cream)"><i></i><i></i><i></i><i></i></div>
</section>

${shelterSection(champions)}

<section class="cont" aria-labelledby="ct-h">
  <div class="cflash" aria-hidden="true"></div>
  <img class="mascot2" src="${A.mascot2}" alt="" width="300" height="340" loading="lazy" decoding="async">
  <img class="mascot" src="${A.mascot}" alt="A white cartoon cat gripping a game controller, ready to play" width="300" height="340" loading="lazy" decoding="async">
  <div class="wrap">
    <h2 class="disp" id="ct-h"><span class="ital">Continue?</span></h2>
    <div class="count" aria-hidden="true">
      <svg viewBox="0 0 100 100"><circle class="trk" cx="50" cy="50" r="46"/><circle class="prg" cx="50" cy="50" r="46" pathLength="1" stroke-dasharray="1" stroke-dashoffset="0"/></svg>
      <div class="n">9</div>
      <div class="press">Press start</div>
    </div>
    <p>Your legend is picked. The lanes are waiting. One click and you are in.</p>
    <div class="ctas">
      <span class="mag"><a class="btn big" id="cont-cta" href="${CONTINUE_CTA_HREF}" data-cta="landing_continue"><span>Play free in your browser <span class="arrow" aria-hidden="true">&#9654;</span></span></a></span>
    </div>
  </div>
  <footer class="foot">
    <img src="${A.logo}" alt="Token Tails" width="420" height="236" loading="lazy" decoding="async">
    <span>Pawlegends by Token Tails</span>
    <a href="${PAWLEGENDS_TERMS_PATH}">Terms</a>
    <a href="#top">Back to top</a>
  </footer>
</section>
</div>`;
}
