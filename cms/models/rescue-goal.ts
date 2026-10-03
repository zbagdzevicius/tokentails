import { RescueGoalStatus } from '@/shared-contracts/enums';

/*
 * Rescue Goals in the CMS (plan G5 "Rescue Goals", decisions #37 and #44). Mirrors the MANAGER view
 * of backend/src/rescue-goal/rescue-goal.service.ts (`ManagerGoal`). The funding amount, the funding
 * line and the proof owner are manager-only: the public view never carries them, and the CMS never
 * shows a Tails-to-money rate (F11 bans it; "Tails have no cash value").
 */

export { RescueGoalStatus };

export const GOAL_FUNDING_CURRENCIES = ['EUR', 'USD', 'USDC'] as const;
export type GoalFundingCurrency = (typeof GOAL_FUNDING_CURRENCIES)[number];

/** Same bounds as backend/src/rescue-goal/rescue-goal.constants.ts. */
export const GOAL_TARGET_MIN = 100;
export const GOAL_TARGET_MAX = 10000000;
export const GOALS_PER_BUDGET_MONTH_MAX = 10;
export const GOALS_PER_BUDGET_MONTH_MIN_HINT = 4;
export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;
export const RECEIPT_MIMES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp'
];
export const PHOTO_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
/** Same as the backend's GOAL_PHOTO_MAX_BYTES. */
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

export const RESCUE_GOAL_STATUS_LABELS: Record<RescueGoalStatus, string> = {
  [RescueGoalStatus.OPEN]: 'Open',
  [RescueGoalStatus.FILLED]: 'Filled',
  [RescueGoalStatus.DELIVERED]: 'Delivered',
  [RescueGoalStatus.CANCELLED]: 'Cancelled'
};

export type PledgeStatus = 'PENDING' | 'CONFIRMED' | 'REFUNDED' | 'REJECTED';

export interface IGoalShelter {
  _id: string;
  name: string;
  slug: string | null;
  image: string | null;
  country: string | null;
  countryCode: string | null;
}

export interface IRescueGoal {
  id: string;
  title: string;
  description: string | null;
  deliverable: string;
  image: string | null;
  shelter: IGoalShelter | null;
  status: RescueGoalStatus;
  /** OPEN but past its end date: players can no longer give; deliver or cancel it. */
  expired?: boolean;
  targetTails: number;
  raisedTails: number;
  remainingTails: number;
  pledgeCount: number;
  endsAt: string | null;
  filledAt: string | null;
  createdAt: string | null;
  delivery: {
    photoUrl: string;
    receiptSha256: string;
    note: string | null;
    deliveredAt: string;
    txHash?: string | null;
  } | null;
  cancelledAt: string | null;
  budgetMonth: string;
  proofOwner: string;
  funding: {
    setAside: boolean;
    line: string;
    amountCents: number;
    currency: GoalFundingCurrency;
    note: string | null;
    setAsideAt: string | null;
  };
  cancelReason: string | null;
  pledges: Record<PledgeStatus, number>;
  receipt: { sha256: string; mime: string; size: number } | null;
  budgetMonthGoals: number;
}

/** `POST /rescue-goals` body. All strings except the target and the set-aside flag. */
export interface IRescueGoalInput {
  shelter: string;
  title: string;
  description?: string;
  deliverable: string;
  image?: string;
  targetTails: number;
  endsAt?: string;
  budgetMonth: string;
  proofOwner: string;
  fundingSetAside: boolean;
  fundingLine: string;
  fundingAmount: string;
  fundingCurrency: GoalFundingCurrency;
  fundingNote?: string;
}

/** `PUT /rescue-goals/:id`: wording, picture, end date and proof owner only. */
export type IRescueGoalUpdate = Partial<
  Pick<
    IRescueGoalInput,
    'title' | 'description' | 'deliverable' | 'image' | 'endsAt' | 'proofOwner'
  >
>;

const BUDGET_MONTH = /^20\d{2}-(0[1-9]|1[0-2])$/;
const AMOUNT = /^\d{1,9}(\.\d{1,2})?$/;
const HTTPS_URL = /^https:\/\/\S+$/i;
export const TX_HASH = /^(0x)?[0-9a-fA-F]{64}$/;

/** What is still missing before a goal can open, as short labels. Empty means it can be sent. */
export function goalInputProblems(
  input: Partial<IRescueGoalInput>,
  now: Date = new Date()
): string[] {
  const len = (v: unknown) => String(v ?? '').trim().length;
  const target = Number(input.targetTails);
  const problems = [
    !input.shelter && 'shelter',
    (len(input.title) < 3 || len(input.title) > 80) && 'title (3 to 80)',
    (len(input.deliverable) < 3 || len(input.deliverable) > 140) &&
      'what it buys (3 to 140)',
    len(input.description) > 600 && 'description (up to 600)',
    (!Number.isInteger(target) ||
      target < GOAL_TARGET_MIN ||
      target > GOAL_TARGET_MAX) &&
      'Tails target',
    !BUDGET_MONTH.test(String(input.budgetMonth || '')) && 'budget month',
    (len(input.proofOwner) < 2 || len(input.proofOwner) > 80) && 'proof owner',
    input.fundingSetAside !== true && 'money set aside',
    len(input.fundingLine) < 2 && 'funding line',
    (!AMOUNT.test(String(input.fundingAmount || '').trim()) ||
      Number(input.fundingAmount) <= 0) &&
      'amount set aside',
    !GOAL_FUNDING_CURRENCIES.includes(
      input.fundingCurrency as GoalFundingCurrency
    ) && 'currency',
    !!input.image &&
      !HTTPS_URL.test(String(input.image).trim()) &&
      'picture URL (https)',
    !!input.endsAt &&
      !(new Date(input.endsAt).getTime() > now.getTime()) &&
      'end date (in the future)'
  ];
  return problems.filter(Boolean) as string[];
}

/** "49.90 EUR" from minor units. */
export function formatFunding(cents: number, currency: string): string {
  const value = Math.max(0, Math.round(Number(cents) || 0));
  return `${Math.floor(value / 100)}.${String(value % 100).padStart(2, '0')} ${currency}`;
}

/** Whole percent filled, 0 to 100. */
export function progressPercent(
  goal: Pick<IRescueGoal, 'raisedTails' | 'targetTails'>
): number {
  if (!goal.targetTails) return 0;
  return Math.min(100, Math.floor((goal.raisedTails / goal.targetTails) * 100));
}

export const tailsText = (n: number) =>
  `${Math.max(0, Math.round(Number(n) || 0)).toLocaleString('en-US')} Tails`;

/** `YYYY-MM` of a date (UTC), for the budget month default. */
export const monthOf = (date: Date) => date.toISOString().slice(0, 7);

export const canEdit = (goal: Pick<IRescueGoal, 'status'>) =>
  goal.status === RescueGoalStatus.OPEN ||
  goal.status === RescueGoalStatus.FILLED;
export const canDeliver = canEdit;
export const canCancel = canEdit;

/** Goals per budget month, not counting cancelled ones (the backend's rule for the cap of 10). */
export function monthCountsOf(
  goals: Pick<IRescueGoal, 'status' | 'budgetMonth'>[]
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const goal of goals) {
    if (goal.status === RescueGoalStatus.CANCELLED) continue;
    counts[goal.budgetMonth] = (counts[goal.budgetMonth] || 0) + 1;
  }
  return counts;
}
