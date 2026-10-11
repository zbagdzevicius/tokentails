/**
 * `/yourcat` API contract (bet #3, docs/plans/yourcat-v2.md §2.1). A hand-written copy of
 * `backend/src/yourcat/yourcat.contracts.ts`; both must stay equal (pinned by
 * `__test__/yourcat-contract.test.ts`, which reads the backend file).
 *
 * These codes are local to `/yourcat` and `/image/portrait` on purpose: `shared/errors.ts` syncs into
 * `catnip-heist/`. Error bodies are `{ statusCode, code, message }`.
 */

export type YourcatAvatarStatus = "pending" | "ready" | "failed" | "none"; // 'none': manual cat, no photo
export type YourcatPortraitStatus = "none" | "pending_payment" | "painting" | "ready" | "failed";
export type YourcatPortraitStyle = "highness" | "monarch" | "aristocrat" | "commander"; // = ImageStyle values

export interface YourcatFamilyOption {
  family: string;
  label: string;
  spriteImg: string;
}

export interface YourcatStatusView {
  enabled: boolean; // YOURCAT_ENABLED
  uploadsOpen: boolean; // enabled && today's budget has room for one upload estimate
  appCheckEnforced: boolean; // AI_UPLOAD_APPCHECK_ENFORCE
  limits: { maxBytes: number; types: string[] }; // 10485760; ['image/jpeg','image/png','image/webp','image/heic','image/heif']
  families: YourcatFamilyOption[]; // the 21 PLAYABLE_FAMILIES, for the manual picker
  portrait: {
    enabled: boolean; // YOURCAT_PORTRAIT_ENABLED
    priceCents: number; // getPortraitCheckoutPrice('digital').cents
    currency: "EUR";
    styles: YourcatPortraitStyle[];
  };
}

export interface YourcatCatView {
  _id: string;
  name: string;
  type: string; // CatAbilityType value
  spriteImg: string; // https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/<FAMILY>/base.png
  catImg: string; // .../assets/<FAMILY>/base/GROOMING.gif
}

export interface YourcatView {
  id: string;
  name: string; // "My cat" when the visitor gave none
  named: boolean; // false while the visitor has not named the cat; the client then says "your cat"
  family: string; // CatOriginType key, never PEACHES
  familyLabel: string; // e.g. 'Ginger'
  cat: YourcatCatView;
  avatar: { status: YourcatAvatarStatus; url: string | null }; // public CDN PNG, 768x768
  photo: { stored: boolean; deleteAfter: string | null }; // ISO date; never a URL
  portrait: { status: YourcatPortraitStatus; style: YourcatPortraitStyle | null; url: string | null };
  createdAt: string;
}

export interface YourcatCheckoutView {
  checkoutUrl: string;
  orderId: string;
}

export interface YourcatDeleteView {
  success: true;
  photoKeptUntilDelivery: boolean;
}

export const YOURCAT_ERROR_CODES = [
  "YOURCAT_DISABLED", "YOURCAT_CONSENT_REQUIRED", "YOURCAT_FILE_REQUIRED", "YOURCAT_FILE_TOO_LARGE",
  "YOURCAT_FILE_TYPE", "YOURCAT_NOT_DECODABLE", "YOURCAT_NAME_INVALID", "YOURCAT_IP_DAILY_CAP",
  "YOURCAT_USER_DAILY_CAP", "YOURCAT_FAILURE_DAILY_CAP", "YOURCAT_BUDGET_EXHAUSTED",
  "YOURCAT_APP_CHECK_REQUIRED", "YOURCAT_APP_CHECK_INVALID", "YOURCAT_NO_CLIENT_IP",
  "YOURCAT_NO_CAT", "YOURCAT_PERSON_VISIBLE", "YOURCAT_CLASSIFY_FAILED", "YOURCAT_FAMILY_INVALID",
  "YOURCAT_NOT_FOUND", "YOURCAT_PHOTO_EXPIRED", "YOURCAT_PORTRAIT_DISABLED", "YOURCAT_PORTRAIT_EXISTS",
  "YOURCAT_STYLE_INVALID",
] as const;
export type YourcatErrorCode = (typeof YOURCAT_ERROR_CODES)[number];

/** True for a code from the list above (the client reads `body.code` itself, §2.1). */
export function isYourcatErrorCode(value: unknown): value is YourcatErrorCode {
  return typeof value === "string" && (YOURCAT_ERROR_CODES as readonly string[]).indexOf(value) !== -1;
}
