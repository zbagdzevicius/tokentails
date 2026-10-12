/**
 * Every string of `/yourcat` (bet #3, docs/plans/yourcat-v2.md §1), in one place so the honesty test
 * (`__test__/yourcat-copy.test.tsx`) and the copy lint read them together.
 *
 * Honesty rules (§1 "Honesty rules"): no share of sales, donation, "every purchase", "proceeds" or
 * "supports the shelter"; no counts of users, cats, portraits, ratings or reviews; no countdowns,
 * strike-through prices or "limited time"; no duration until it is measured. The Pink Paw panel only
 * says the visitor's cat meets a named cat from Pink Paw.
 */
import { PortraitStyle } from "@/features/portrait/components/StylePickerDrawer";
import type { YourcatErrorCode, YourcatPortraitStyle } from "@/models/yourcat";
import type { CardText } from "./cardLayout";
import { YOURCAT_ENTRY_COPY } from "./useYourcatAvailable";

/** S1-P version, sent with the upload as `noticeVersion`. Bump it whenever the privacy text changes. */
export const PRIVACY_NOTICE_VERSION = "2026-10-12";

/**
 * "In about 30 seconds" is added to the S1 body only once the measured p75 of `secondsToReveal`
 * (§7.1) is at or below 30 s. Not measured yet, so it stays off.
 */
export const DURATION_MEASURED = false;

export const NAME_MAX = 20;

/**
 * A landing-style headline (docs/plans/yourcat-polish.md §2.3): `before`, then the glowing key words,
 * then `after`. Structurally the same as `HeadlineParts` in `brand.tsx`. Strings stay in sentence case
 * here (the uppercase is CSS), so screen readers read normal case.
 */
export interface TitleParts {
  before?: string;
  glow: string;
  after?: string;
}

/** The plain text of a headline ("Meet Mochi."), for accessible names and tests. */
export function titleText(parts: TitleParts): string {
  return `${parts.before ?? ""}${parts.glow}${parts.after ?? ""}`;
}

/** The operator's legal name and address for S1-P: a launch condition (§10), filled in before launch. */
export const CONTROLLER = "{Controller}";

// ---- names -----------------------------------------------------------------------------------

/** `{Name}`: the record's name when the visitor named the cat, otherwise "your cat". */
export function displayName(name: string | null | undefined, named: boolean): string {
  const clean = (name || "").trim();
  return named && clean ? clean : "your cat";
}

/** Sentence start: "your cat" becomes "Your cat"; a real name is left as typed. */
export function sentenceName(name: string): string {
  return name === "your cat" ? "Your cat" : name;
}

/** `{Name}'s` ("your cat's", "Mochi's"). */
export function possessive(name: string): string {
  return `${name}'s`;
}

// ---- 1.0 states before upload ----------------------------------------------------------------

export const STATUS_COPY = {
  loading: "Getting ready…",
  disabled: "Making cats from photos is paused right now. Please come back later.",
  budgetSpent: "We have made all the AI cats we can for today.",
  /**
   * This visitor's own daily cap (`YOURCAT_IP_DAILY_CAP`, `_USER_`, `_FAILURE_`): the S2 alert, and the
   * S1 line while the cap is remembered for this tab (R2-09). No countdown and no reset time: the
   * server counts a UTC day, which is not the visitor's day.
   */
  ownCapSpent: "You have made all your AI cats for today. Your cat can still join the game with a look you pick.",
  pickYourself: "Pick your cat's look yourself",
  appBody:
    "Making your cat from a photo works in your browser. Open tokentails.com/yourcat on your phone or computer.",
  appLink: "https://tokentails.com/yourcat",
  /** The app notice (§1.0): its title, and the way into the game that works in the app. */
  appTitle: "Make your cat in your browser",
  playNow: "Play now",
  copyLink: "Copy link",
  /** The paused state's way on (§1.0). */
  playGame: "Play Token Tails",
  startOver: "Start over with a new photo",
  /** While uploads are closed (budget spent, paused) a start over cannot promise a new photo. */
  startOverPlain: "Start over",
} as const;

/**
 * The link to `/yourcat` from the landing and the onboarding ceremony (shown only while uploads are
 * open). It lives in the light `useYourcatAvailable.ts`, so the landing does not load this file.
 */
export const ENTRY_LINK = YOURCAT_ENTRY_COPY;

// ---- S1 --------------------------------------------------------------------------------------

export const S1 = {
  /** The kicker chip (§4 S1). Hidden while uploads are paused or the budget is spent. */
  chip: "One photo · Free · No sign-up",
  title: { before: "Your cat, ", glow: "in the game." } as TitleParts,
  body: "Hang one photo of your cat here. It steps out as a pixel cat you can play, with a card to share.",
  duration: "In about 30 seconds.",
  /** The empty frame's label, under the dashed silhouette. */
  frameLabel: "Your cat here",
  /** The S1 companion on the altar is a stock pixel cat, never the visitor's: it says so. */
  example: "Example",
  exampleAlt: "Example pixel cat",
  choose: "Choose a photo",
  dropHint: "or drop it here",
  confirm: "By choosing a photo you confirm it is your cat and you may use it.",
  privacy: "We use your photo only to make your cat. We keep it privately for 30 days, then delete it.",
  privacyLink: "How we handle photos",
  fileType: "Please use a JPEG, PNG, WebP or HEIC photo.",
  fileSize: "That photo is over 10 MB. Please choose a smaller one.",
  notDecodable: "We could not open that photo. Please try another one.",
} as const;

// ---- S0: a friend's cat (`/yourcat?cat=<shareId>`) --------------------------------------------

/** The friend view (docs/plans/yourcat-polish.md §4 S0): a shared cat, pettable, beside an empty frame. */
export const FRIEND = {
  /** `name` is null while the friend's cat has no name. */
  title: (name: string | null): TitleParts =>
    name ? { before: `${name} says `, glow: "hi." } : { before: "A pixel cat says ", glow: "hi." },
  body: "Someone turned their cat into a pixel cat. Hang a photo of yours in the empty frame.",
  /** The small empty frame on the altar. */
  frameLabel: "Your cat here",
  /** A visitor who already has a cat can open it. */
  seeYours: "See your cat",
  /** The friend's cat on the altar, pettable (§4.3). */
  pet: {
    pet: (name: string | null) => (name ? `Pet ${name}` : "Pet this cat"),
    tap: (name: string | null) => (name ? `Tap ${name}` : "Tap the cat"),
    purrs: (name: string | null) => (name ? `${name} purrs.` : "The cat purrs."),
  },
  /** The friend's portrait in the main frame. */
  portraitAlt: (name: string | null, familyLabel: string) =>
    name ? `${name}, a ${familyLabel} pixel cat` : `A ${familyLabel} pixel cat`,
} as const;

/** The S1 body, with the duration only once it is measured (§1 S1, honesty rules). */
export function s1Body(measured: boolean = DURATION_MEASURED): string {
  return measured ? `${S1.body} ${S1.duration}` : S1.body;
}

// ---- S1-P ------------------------------------------------------------------------------------

export const PRIVACY = {
  title: "How we handle your photo",
  paragraphs: [
    `Who is responsible: ${CONTROLLER}, tokentails.com. Contact: info@tokentails.com.`,
    "What we do with it: we make your pixel cat, its pixel portrait and your share card. If you buy the HD portrait, we also paint that from the same photo.",
    "If you share your cat's link, anyone who opens it sees your cat's name and pixel look, never your photo.",
    "Who processes it for us: OpenAI (to check the photo shows a cat and match it to a pixel family), Google Gemini (to draw the pixel portrait and, if you buy it, the HD portrait), DigitalOcean in Frankfurt (storage) and Stripe (payments).",
    "Transfers outside the EU: OpenAI and Google process the photo in the United States, under the EU Standard Contractual Clauses (and the EU–US Data Privacy Framework where the provider is certified). They may keep what we send for up to 30 days to detect abuse, then delete it. Neither uses it to train its models.",
    "How long we keep it: our copy of the original photo is stored privately and deleted after 30 days (or once a portrait you bought is delivered, if that is later). The pixel portrait stays with your cat until you delete it; after you delete it, copies cached by our image network can still load for up to an hour. We strip location and camera data from the photo.",
    "Why we may do this: to give you the service you asked for (GDPR Art. 6(1)(b)).",
    "Your rights: you can ask to see your data, have it deleted, or object to its use. Use “Delete my photo” below your cat, or write to info@tokentails.com. You can also complain to the Lithuanian data protection authority (VDAI, vdai.lrv.lt).",
    "Please only upload photos of your own cat, and no people. Photos with people are refused.",
  ],
} as const;

// ---- S2 --------------------------------------------------------------------------------------

export const S2 = {
  title: { before: "Turning ", glow: "your cat", after: " into pixels" } as TitleParts,
  /**
   * The match is back and the pixel portrait is being drawn (R2-01): S2 holds for it (at most
   * `PORTRAIT_WAIT_MS`), so the reveal lands on the real portrait instead of a placeholder.
   */
  almostTitle: { before: "Almost ", glow: "there" } as TitleParts,
  /** This visitor's daily cap was reached (R2-09): its own heading, not a failure heading. */
  ownCapTitle: { before: "That's today's ", glow: "AI cats" } as TitleParts,
  /** The heading once the upload or the match failed (the alert says why). */
  failedTitle: { before: "We couldn't make ", glow: "your pixel cat" } as TitleParts,
  /**
   * The honest three-segment meter (§4.1). Each segment fills only on a real event: the body was sent,
   * POST /yourcat answered, the pixel portrait is ready. No percentages, timers or fake steps.
   */
  meter: {
    label: "Progress",
    photo: "Photo",
    coat: "Coat",
    portrait: "Portrait",
    sending: "Sending your photo…",
    received: "Photo received · Finding the right coat and colours…",
    painting: "Painting your pixel portrait…",
    ready: "Your pixel portrait is ready",
    stopped: "Stopped",
    /** Visually hidden after a segment, so the state is read out. */
    done: "done",
    failed: "failed",
  },
  /** The kicker chip once the portrait is ready, or on a returning visit. */
  inGame: "In the game",
  /** The plain 429's countdown on "Try again" (visual only; the button name stays "Try again"). */
  retryIn: (seconds: number | string) => `in ${seconds}s`,
  /** The only name field in the flow (UX-04); S3 renames with the pencil. */
  nameLabel: "While you wait: what's their name?",
  namePlaceholder: "Mochi",
  leave: "You can leave. Your cat will wait for you here.",
  photoAlt: "Your photo",
} as const;

/** What an error offers (§1 S2 table). */
export type ErrorAction = "manual" | "another" | "retry" | "reload" | "back";

export interface ErrorCopy {
  message: string;
  actions: ErrorAction[];
  /** Seconds before "Try again" is enabled (the plain 429). */
  retryAfterSeconds?: number;
  /** A heading of its own instead of `S2.failedTitle` (the visitor's daily cap). */
  title?: TitleParts;
  /** The visitor's own daily cap: nothing was made from the photo, so the meter fills no segment. */
  ownCap?: boolean;
}

export const ERROR_TEXT = {
  ownCap: STATUS_COPY.ownCapSpent,
  budget: STATUS_COPY.budgetSpent,
  disabled: STATUS_COPY.disabled,
  noCat: "We could not see a cat in that photo. Try one where your cat fills most of the picture.",
  person: "We only use photos of cats with no people in them. Please choose a photo of just your cat.",
  classify: "We could not read that photo just now. Please try again.",
  appCheck: "We could not check your browser. Please reload the page and try again.",
  consent: "Please reload the page and try again.",
  burst: "Too many tries at once. Please wait a moment and try again.",
  generic: "Something went wrong on our side. Please try again.",
  manualCap: "You have made all the cats you can for today. Please come back tomorrow.",
  pickLook: "Please pick a look for your cat.",
} as const;

export const ACTION_LABELS: Record<ErrorAction, string> = {
  manual: STATUS_COPY.pickYourself,
  another: "Try another photo",
  retry: "Try again",
  reload: "Reload",
  back: "Choose another photo",
};

/** How a failed request reads (the `code` in the body, a bare 429, or no answer at all). */
export type RequestFailure =
  | { kind: "code"; code: YourcatErrorCode; message?: string }
  | { kind: "rate-limited" }
  | { kind: "network" }
  | { kind: "server" };

/** §1 S2 error table: the copy and the actions for a failed upload. */
export function uploadErrorCopy(failure: RequestFailure): ErrorCopy {
  if (failure.kind === "rate-limited") return { message: ERROR_TEXT.burst, actions: ["retry"], retryAfterSeconds: 10 };
  if (failure.kind !== "code") return { message: ERROR_TEXT.generic, actions: ["retry"] };
  switch (failure.code) {
    case "YOURCAT_IP_DAILY_CAP":
    case "YOURCAT_USER_DAILY_CAP":
    case "YOURCAT_FAILURE_DAILY_CAP":
      return { message: ERROR_TEXT.ownCap, actions: ["manual"], title: S2.ownCapTitle, ownCap: true };
    case "YOURCAT_BUDGET_EXHAUSTED":
      return { message: ERROR_TEXT.budget, actions: ["manual"] };
    case "YOURCAT_DISABLED":
    case "YOURCAT_NO_CLIENT_IP":
      return { message: ERROR_TEXT.disabled, actions: [] };
    case "YOURCAT_NO_CAT":
      return { message: ERROR_TEXT.noCat, actions: ["another", "manual"] };
    case "YOURCAT_PERSON_VISIBLE":
      return { message: ERROR_TEXT.person, actions: ["another"] };
    case "YOURCAT_CLASSIFY_FAILED":
      return { message: ERROR_TEXT.classify, actions: ["retry", "manual"] };
    case "YOURCAT_FILE_TOO_LARGE":
      return { message: S1.fileSize, actions: ["back"] };
    case "YOURCAT_FILE_TYPE":
    case "YOURCAT_FILE_REQUIRED":
      return { message: S1.fileType, actions: ["back"] };
    case "YOURCAT_NOT_DECODABLE":
      return { message: S1.notDecodable, actions: ["back"] };
    case "YOURCAT_APP_CHECK_REQUIRED":
    case "YOURCAT_APP_CHECK_INVALID":
      return { message: ERROR_TEXT.appCheck, actions: ["reload"] };
    case "YOURCAT_CONSENT_REQUIRED":
      return { message: ERROR_TEXT.consent, actions: ["reload"] };
    default:
      return { message: ERROR_TEXT.generic, actions: ["retry"] };
  }
}

/** The failure code as `upload_done` reports it. */
export function failureEventCode(failure: RequestFailure): YourcatErrorCode | "NETWORK" | "RATE_LIMITED" | undefined {
  if (failure.kind === "code") return failure.code;
  if (failure.kind === "rate-limited") return "RATE_LIMITED";
  if (failure.kind === "network") return "NETWORK";
  return undefined;
}

// ---- S3 --------------------------------------------------------------------------------------

/** The coat word of the five base families (story-02); other families say "the {label} look". */
export const COAT_WORDS: Readonly<Record<string, string>> = {
  BLACK: "black",
  GREY: "grey",
  YELLOW: "ginger",
  WHITE: "white",
  SIAMESE: "siamese",
};

export const S3 = {
  title: (name: string): TitleParts => ({ before: "Meet ", glow: `${name}.` }),
  /** The pencil after the heading. */
  rename: (name: string) => (name === "your cat" ? "Name your cat" : `Rename ${name}`),
  renameLabel: "Your cat's name",
  renameSave: "Save",
  drawFailed: (name: string) =>
    `The pixel portrait did not work this time. Your card uses ${possessive(name)} game look.`,
  /** One body line: what the cat is in the game (story-02). `manual` is the no-AI pick (§1.5). */
  coatLine: (name: string, family: string, label: string, manual: boolean) => {
    const who = sentenceName(name);
    const coat = COAT_WORDS[family];
    if (manual) return `${who} is in the game, in the ${coat || label} look you picked.`;
    if (coat) return `${who} is in the game. Same ${coat} coat, new pixel paws.`;
    return `${who} is in the game, with the ${label} look.`;
  },
  /** The pettable cat (§4.3): its button name, the caption before and after a tap. */
  pet: {
    pet: (name: string) => (name === "your cat" ? "Pet your cat" : `Pet ${name}`),
    tap: (name: string) => `Tap ${name}`,
    purrs: (name: string) => `${sentenceName(name)} purrs.`,
  },
  /** Re-runs the step-out from the photo still in memory (fresh uploads only). */
  replay: {
    label: "Watch again",
    aria: (name: string) => `Watch ${name} step out again`,
  },
  /** The in-frame label while the pixel portrait is drawn (UX-06) and the reduced-motion photo badge. */
  pendingLabel: "Painting your pixel portrait…",
  photoBadge: "Your photo",
  frameLabel: (name: string, family: string) => `${sentenceName(name)}, ${family} pixel cat`,
  /**
   * The quiet meeting with a real Pink Paw cat (§4.4). Only the cat's name and "a real cat at Pink Paw":
   * no status, location or money words.
   */
  meeting: {
    title: (name: string, shelterName: string): TitleParts => ({
      before: `${sentenceName(name)}, meet `,
      glow: `${shelterName}.`,
    }),
    body: (shelterName: string) => `${shelterName} is a real cat at Pink Paw, a cat shelter. Put them on one card?`,
    toggle: (shelterName: string) => `Put ${shelterName} on my card`,
    frameAlt: (shelterName: string) => `${shelterName}, a real cat at Pink Paw`,
  },
  /** The phone sheet with the other ways to share. */
  more: {
    label: "More",
    title: "More ways to share",
    close: "Close",
  },
  cardAlt: (name: string, family: string) => `Share card: ${name}, a ${family} pixel cat, tokentails.com/yourcat`,
  formatLabel: "Card format",
  story: "Story",
  post: "Post",
  share: "Share",
  download: "Download",
  copyLink: "Copy link",
  preparing: "Preparing card…",
  play: (name: string) => `Play as ${name}`,
  saved: "Card saved.",
  copied: "Link copied.",
  copyFallback: "Press Ctrl+C or long-press to copy.",
  longPress: "Press and hold the card to save it.",
  inAppHint: "For more ways to share, open this page in your browser.",
  /**
   * The Web Share `text` and the copied text (§4.5). Without a name the sharer says "My cat"; with the
   * Pink Paw panel on the card, the shelter cat is named.
   */
  shareText: (name: string, shareUrl: string, shelterName: string | null) => {
    const who = name === "your cat" ? "My cat" : name;
    return shelterName
      ? `${who} is a pixel cat now, and just met ${shelterName}, a real cat from Pink Paw. Turn your cat into one: ${shareUrl}`
      : `${who} is a pixel cat now. Turn your cat into one: ${shareUrl}`;
  },
  guestNote: (name: string) =>
    `${sentenceName(name)} lives in this browser for now. Create an account to keep ${name} for good.`,
  guestCaveat: (name: string) => `Already have an account? ${sentenceName(name)} can't move to it yet.`,
  createAccount: "Create an account",
  deleteLink: "Delete my photo",
  deleteConfirm: (name: string, family: string) =>
    `Delete the photo and the pixel portrait? ${sentenceName(name)} stays in the game with the ${family} look.`,
  deletePaidPending: "Your HD portrait is still being painted. We delete the photo as soon as it is delivered.",
  deleteYes: "Delete",
  deleteNo: "Keep",
  deleted: "Deleted.",
  deleteFailed: "We could not delete the photo. It is still stored. Please try again.",
  nameSaveFailed: ERROR_TEXT.generic,
  cardFailed: "We could not draw the card in this browser. You can still copy the link.",
} as const;

// ---- Share card text -------------------------------------------------------------------------

/** The strings the card draws (§9.3): `cardLayout` takes them ready-made, so it stays pure. */
export type { CardText };

export const CARD_TEXT = {
  wordmark: "TOKEN TAILS",
  subline: "Now a pixel cat in Token Tails",
  /** The one line under the title when the Pink Paw cat is in the scene (R1-05): name and fact only. */
  shelterLine: (shelterName: string) => `${shelterName} · a real cat at Pink Paw`,
  link: "tokentails.com/yourcat",
  /** The name line while the cat has no name: "Ginger cat", never "My cat". */
  unnamed: (familyLabel: string) => `${familyLabel} cat`,
} as const;

/** The card's text for one variant: `shelterName` null draws the card solo. */
export function cardText(name: string, named: boolean, familyLabel: string, shelterName: string | null): CardText {
  const clean = name.trim();
  const hasName = named && !!clean;
  const solo = hasName ? clean : CARD_TEXT.unnamed(familyLabel);
  return {
    wordmark: CARD_TEXT.wordmark,
    link: CARD_TEXT.link,
    nameLine: shelterName && hasName ? `${clean} & ${shelterName}` : solo,
    nameFallback: solo,
    subline: shelterName ? CARD_TEXT.shelterLine(shelterName) : CARD_TEXT.subline,
    panel: shelterName ? { name: shelterName } : null,
  };
}

// ---- 1.5 manual pick -------------------------------------------------------------------------

export const MANUAL = {
  title: "Pick your cat's look",
  titleParts: { before: "Pick ", glow: "your cat's look" } as TitleParts,
  legend: "Your cat's look",
  /** The base six show first; this pill expands the other families. */
  moreLooks: "More looks",
  fewerLooks: "Fewer looks",
  /** The selected look, previewed on the altar beside the empty frame. */
  preview: (label: string) => `Preview: the ${label} look`,
  nameLabel: "What's their name?",
  make: "Make my cat",
  making: "Making your cat…",
  back: "Back to the photo",
  /** While uploads are closed there is no photo to go back to. */
  backPlain: "Back",
} as const;

// ---- S5 --------------------------------------------------------------------------------------

/** The four styles of the HD portrait, with their existing example images (§1 S5). */
export const PORTRAIT_STYLES: ReadonlyArray<{ id: YourcatPortraitStyle; style: PortraitStyle; label: string; image: string }> = [
  // One painted cat each (no dogs, no famous-cat likeness): the examples must show what is sold.
  { id: "highness", style: PortraitStyle.HIGHNESS, label: "Highness", image: "/portrait/highness-2.webp" },
  { id: "monarch", style: PortraitStyle.MONARCH, label: "Monarch", image: "/portrait/monarch-3.webp" },
  { id: "aristocrat", style: PortraitStyle.ARISTOCRAT, label: "Aristocrat", image: "/portrait/aristocrat-1.webp" },
  { id: "commander", style: PortraitStyle.COMMANDER, label: "Commander", image: "/portrait/commander-2.webp" },
];

/** `{price}` from `GET /yourcat/status` (euro cents, formatted "€N"); never a number written in the client. */
export function formatPrice(priceCents: number, currency: string): string {
  return new Intl.NumberFormat("en-IE", { style: "currency", currency, minimumFractionDigits: 0 }).format(
    priceCents / 100,
  );
}

export const S5 = {
  /** "Mochi, painted like royalty." (§4 S5). */
  titleParts: (name: string): TitleParts => ({ before: `${sentenceName(name)}, `, glow: "painted like royalty." }),
  title: (name: string) => titleText({ before: `${sentenceName(name)}, `, glow: "painted like royalty." }),
  /** `price` always comes from `formatPrice(status)`. "We paint it after you pay" stays: the examples are not the visitor's result. */
  body: (name: string, price: string) =>
    `A 4K painted portrait from the same photo, in the style you pick. ${price}, paid once. We paint it after you pay. It appears here and in your email when it's ready. If it doesn't look like ${name}, reply to the email and we'll paint it again once.`,
  legend: "Pick a style (examples)",
  styleLegend: "Pick a style (examples)",
  styleAlt: (label: string) => `Example of the ${label} style`,
  button: (price: string) => `Get the HD portrait · ${price}`,
  opening: "Opening checkout…",
  finePrint:
    "Card payment by Stripe. Digital download, no shipping. Because we start painting right after you pay, you will be asked to agree that the 14-day right of withdrawal ends once the portrait is delivered.",
  photoExpired: "Your original photo was deleted after 30 days. Upload it again to order a portrait.",
  exists: "You already bought this portrait.",
  unavailable: "The HD portrait is not available right now. Please try again later.",
} as const;

// ---- S6 --------------------------------------------------------------------------------------

export const S6 = {
  confirming: "Confirming your payment…",
  /** "Mochi's portrait is being painted." */
  paintingTitleParts: (name: string): TitleParts => ({
    before: `${possessive(sentenceName(name))} portrait is `,
    glow: "being painted.",
  }),
  paintingTitle: (name: string) =>
    titleText({ before: `${possessive(sentenceName(name))} portrait is `, glow: "being painted." }),
  paintingBody: "It appears here and in your email when it's ready. You can close this page.",
  readyTitleParts: { before: "Hung in ", glow: "the gallery." } as TitleParts,
  readyTitle: () => titleText({ before: "Hung in ", glow: "the gallery." }),
  portraitAlt: (name: string) => `HD portrait of ${name}`,
  /** Painting in the frame (§4 S6). */
  paintingLabel: "Painting…",
  download: "Download 4K",
  play: (name: string) => `Play as ${name}`,
  back: (name: string) => `Back to ${possessive(name)} card`,
  /** Late or failed: a short heading, the details in the body. */
  lateTitle: "Your portrait is on its way by email",
  late: "This is taking longer than usual. We will email the portrait to you as soon as it is ready, at the latest within 2 working days.",
  failed: "Painting the portrait did not work this time. Within 2 working days we will email you the portrait or refund you in full.",
} as const;

/** Every fixed string above, flattened (for the honesty test and the copy lint). */
export function allStaticCopy(): string[] {
  const out: string[] = [];
  const walk = (value: unknown) => {
    if (typeof value === "string") out.push(value);
    else if (typeof value === "function") {
      const fn = value as (...args: string[]) => unknown;
      walk(fn("Mochi", "Ginger", "{price}"));
      walk(fn("your cat", "Ginger", "{price}"));
      // Two-name strings (the meeting, the share text) with the shelter cat named.
      walk(fn("Mochi", "Zare", "Ginger", "Zare"));
      walk(fn("your cat", "YELLOW", "Ginger", "Zare"));
      walk(fn("Mochi", "OREO", "Oreo", ""));
    } else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") Object.values(value).forEach(walk);
  };
  [STATUS_COPY, ENTRY_LINK, S1, FRIEND, PRIVACY, S2, ERROR_TEXT, ACTION_LABELS, COAT_WORDS, S3, CARD_TEXT, MANUAL, S5, S6].forEach(walk);
  walk(cardText("Mochi", true, "Ginger", "Zare"));
  walk(cardText("", false, "Ginger", "Zare"));
  walk(cardText("Mochi", true, "Ginger", null));
  PORTRAIT_STYLES.forEach((style) => out.push(style.label));
  return out;
}
