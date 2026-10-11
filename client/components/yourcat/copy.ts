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

/** S1-P version, sent with the upload as `noticeVersion`. Bump it whenever the privacy text changes. */
export const PRIVACY_NOTICE_VERSION = "2026-10-11";

/**
 * "In about 30 seconds" is added to the S1 body only once the measured p75 of `secondsToReveal`
 * (§7.1) is at or below 30 s. Not measured yet, so it stays off.
 */
export const DURATION_MEASURED = false;

export const NAME_MAX = 20;

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
  pickYourself: "Pick your cat's look yourself",
  appBody:
    "Making your cat from a photo works in your browser. Open tokentails.com/yourcat on your phone or computer.",
  appLink: "https://tokentails.com/yourcat",
  copyLink: "Copy link",
  startOver: "Start over with a new photo",
} as const;

// ---- S1 --------------------------------------------------------------------------------------

export const S1 = {
  eyebrow: "TOKEN TAILS",
  title: "Your cat, in the game.",
  body: "Upload one photo of your cat. You get a pixel cat you can play, a pixel portrait and a card to share. Free, no sign-up.",
  duration: "In about 30 seconds.",
  choose: "Choose a photo",
  dropHint: "or drop it here",
  confirm: "By choosing a photo you confirm it is your cat and you may use it.",
  privacy: "We use your photo only to make your cat. We keep it privately for 30 days, then delete it.",
  privacyLink: "How we handle photos",
  fileType: "Please use a JPEG, PNG, WebP or HEIC photo.",
  fileSize: "That photo is over 10 MB. Please choose a smaller one.",
  notDecodable: "We could not open that photo. Please try another one.",
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
  title: "Making your pixel cat",
  uploading: "Uploading your photo…",
  matching: (name: string) => `Matching ${name} to a pixel cat family…`,
  nameLabel: "What is your cat's name?",
  namePlaceholder: "Mochi",
  leave: "You can leave and come back; your cat will be here.",
  photoAlt: "Your photo",
} as const;

/** What an error offers (§1 S2 table). */
export type ErrorAction = "manual" | "another" | "retry" | "reload" | "back";

export interface ErrorCopy {
  message: string;
  actions: ErrorAction[];
  /** Seconds before "Try again" is enabled (the plain 429). */
  retryAfterSeconds?: number;
}

export const ERROR_TEXT = {
  ownCap: "You have made all your AI cats for today.",
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
      return { message: ERROR_TEXT.ownCap, actions: ["manual"] };
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

export const S3 = {
  title: (name: string) => `Meet ${name}.`,
  drawing: (name: string) => `Drawing ${possessive(name)} pixel portrait…`,
  drawFailed: (name: string) =>
    `The pixel portrait did not work this time. Your card uses ${possessive(name)} game look.`,
  matched: (name: string, family: string) =>
    name === "your cat"
      ? `We matched your cat to our ${family} cat family. It is now your cat in Token Tails.`
      : `We matched ${name} to our ${family} cat family. ${name} is now your cat in Token Tails.`,
  playCat: (name: string) => `Play ${possessive(name)} animation again`,
  nameLabel: "Name for the card",
  cardAlt: (name: string, family: string) => `Share card: ${name}, a ${family} pixel cat, tokentails.com/yourcat`,
  formatLabel: "Card format",
  story: "Story 9:16",
  post: "Post 4:5",
  shelterSwitch: (shelterCat: string) => `With ${shelterCat} from Pink Paw`,
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
  /** The Web Share `text` and the copied text. Without a name the sharer says "my cat". */
  shareText: (name: string, shareUrl: string) =>
    `Meet ${name === "your cat" ? "my cat" : name}, now a pixel cat in Token Tails. Make yours free: ${shareUrl}`,
  guestNote: (name: string) =>
    `${sentenceName(name)} lives on this browser for now. Create an account to keep ${name} for good. Signing in to an account you already had does not bring ${name} along yet.`,
  createAccount: "Create an account",
  deleteLink: "Delete my photo",
  deleteConfirm: (name: string, family: string) =>
    `Delete the photo and the pixel portrait? ${sentenceName(name)} stays in the game with the ${family} look.`,
  deletePaidPending: "Your HD portrait is still being painted. We delete the photo as soon as it is delivered.",
  deleteYes: "Delete",
  deleteNo: "Keep",
  deleted: "Deleted.",
  nameSaveFailed: ERROR_TEXT.generic,
  cardFailed: "We could not draw the card in this browser. You can still copy the link.",
} as const;

// ---- Share card text -------------------------------------------------------------------------

export const CARD_TEXT = {
  wordmark: "TOKEN TAILS",
  subline: "Now a pixel cat in Token Tails",
  meets: "MEETS",
  fromPinkPaw: "FROM PINK PAW",
  link: "tokentails.com/yourcat",
  /** The name line while the cat has no name: "Ginger cat", never "My cat". */
  unnamed: (familyLabel: string) => `${familyLabel} cat`,
} as const;

// ---- 1.5 manual pick -------------------------------------------------------------------------

export const MANUAL = {
  title: "Pick your cat's look yourself",
  legend: "Your cat's look",
  make: "Make my cat",
  making: "Making your cat…",
  back: "Back to the photo",
} as const;

// ---- S5 --------------------------------------------------------------------------------------

/** The four styles of the HD portrait, with their existing example images (§1 S5). */
export const PORTRAIT_STYLES: ReadonlyArray<{ id: YourcatPortraitStyle; style: PortraitStyle; label: string; image: string }> = [
  { id: "highness", style: PortraitStyle.HIGHNESS, label: "Highness", image: "/portrait/highness-1.webp" },
  { id: "monarch", style: PortraitStyle.MONARCH, label: "Monarch", image: "/portrait/monarch-1.webp" },
  { id: "aristocrat", style: PortraitStyle.ARISTOCRAT, label: "Aristocrat", image: "/portrait/aristocrat-1.webp" },
  { id: "commander", style: PortraitStyle.COMMANDER, label: "Commander", image: "/portrait/commander-1.webp" },
];

/** `{price}` from `GET /yourcat/status` (euro cents, formatted "€N"); never a number written in the client. */
export function formatPrice(priceCents: number, currency: string): string {
  return new Intl.NumberFormat("en-IE", { style: "currency", currency, minimumFractionDigits: 0 }).format(
    priceCents / 100,
  );
}

export const S5 = {
  title: (name: string) => `Want a painted HD portrait of ${name}?`,
  body: (name: string, price: string) =>
    `A 4K painted portrait made from the same photo, in the style you pick. ${price}, paid once. We paint it after you pay; the pictures below show each style. You see it on this page when it is ready, and we email it to you. If it does not look like ${name}, reply to the email and we will redo it once.`,
  styleLegend: "Portrait style",
  styleAlt: (label: string) => `Example of the ${label} style`,
  button: (price: string) => `Get the HD portrait for ${price}`,
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
  paintingTitle: (name: string) => `Payment received. We are painting ${name}.`,
  paintingBody: "This takes 1 to 2 minutes. We also email the portrait to you.",
  readyTitle: (name: string) => `Here is ${name}.`,
  portraitAlt: (name: string) => `HD portrait of ${name}`,
  download: "Download",
  back: (name: string) => `Back to ${possessive(name)} card`,
  late: "This is taking longer than usual. We will email the portrait to you as soon as it is ready, at the latest within 2 working days.",
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
    } else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") Object.values(value).forEach(walk);
  };
  [STATUS_COPY, S1, PRIVACY, S2, ERROR_TEXT, ACTION_LABELS, S3, CARD_TEXT, MANUAL, S5, S6].forEach(walk);
  PORTRAIT_STYLES.forEach((style) => out.push(style.label));
  return out;
}
