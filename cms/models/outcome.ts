/*
 * CMS copy of the backend ShelterOutcome model (backend/src/impact/outcome.schema.ts, plan G11).
 * OUTCOME_TYPES must match the backend list and the labels in client/pages/impact.tsx:
 * backend/src/impact/outcome-copies.spec.ts fails when they drift.
 */

export const OUTCOME_TYPES = [
  'treatment',
  'surgery',
  'vaccination',
  'adoption',
  'food',
  'supplies'
] as const;
export type OutcomeType = (typeof OUTCOME_TYPES)[number];

export const OUTCOME_TYPE_LABELS: Record<OutcomeType, string> = {
  treatment: 'Treatment',
  surgery: 'Surgery',
  vaccination: 'Vaccination',
  adoption: 'Adoption',
  food: 'Food',
  supplies: 'Supplies'
};

/** The animal's name only, as the backend checks it (`ANIMAL_NAME`). */
export const ANIMAL_NAME = new RegExp("^[\\p{L}][\\p{L} '’.-]{0,39}$", 'u');

export type OutcomeStatus =
  | 'draft'
  | 'awaiting-redaction'
  | 'awaiting-approval'
  | 'published';

export const OUTCOME_STATUS_LABELS: Record<OutcomeStatus, string> = {
  draft: 'Draft',
  'awaiting-redaction': 'Needs redaction check',
  'awaiting-approval': 'Needs second reviewer',
  published: 'Published'
};

/**
 * What the reviewer confirms by ticking the redaction checkbox (decision #78 reviewer policy). Shown
 * next to the checkbox; the backend stores who ticked it and when.
 */
export const REDACTION_CHECKLIST = [
  'No human faces, hands with rings or tattoos, or reflections of people',
  'No documents, receipts, screens, addresses, house numbers or car plates',
  'No phone numbers, emails or names other than the animal’s',
  'The text names the animal only'
] as const;

/** A redaction box, normalised to the image (0 to 1 from the top-left). */
export interface IRedactionRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** GET /impact/outcomes/manage row (backend OutcomeView). */
export interface IOutcome {
  id: string;
  type: OutcomeType;
  date: string;
  shelter: string;
  shelterId: string;
  animalName: string | null;
  amount: string | null;
  amountWei: string | null;
  symbol: string | null;
  tier: 'shelter-confirmed' | 'shelter-signed' | null;
  payoutId: string | null;
  payoutTxHash: string | null;
  imageUrl: string | null;
  status: OutcomeStatus;
  hasImage: boolean;
  imageRegions: number;
  redacted: boolean;
  redactedByMe: boolean;
  createdByMe: boolean;
  approvedByMe: boolean;
  canApprove: boolean;
  blocker: string | null;
  publishedAt: string | null;
}

/** Body of POST and PUT /impact/outcomes/manage. Empty strings clear a field. */
export interface IOutcomeInput {
  shelter?: string;
  type?: OutcomeType;
  date?: string;
  amount?: string;
  symbol?: string;
  animalName?: string;
  payout?: string;
}

/** Why a reviewer cannot approve, or null when they can (mirrors the backend rule). */
export function approvalBlocker(outcome: IOutcome): string | null {
  if (outcome.status === 'published') return 'Already published';
  if (!outcome.redacted) return 'Tick the redaction check first';
  if (outcome.createdByMe)
    return 'You wrote it: a second reviewer must approve';
  if (outcome.redactedByMe)
    return 'You did the redaction check: a second reviewer must approve';
  return null;
}
