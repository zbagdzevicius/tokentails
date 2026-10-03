import type {
  IRescueGoal,
  IRescueGoalInput,
  IRescueGoalUpdate
} from '@/models/rescue-goal';
import { apiUrl, getAuthHeaders, waitForLocalStorageKey } from './api';
import { ApiError, ApiResult, send } from './payouts-api';

/*
 * Rescue Goals (plan G5) for the CMS. Backed by backend/src/rescue-goal/rescue-goal.controller.ts:
 * - GET  /rescue-goals/admin/goals[?status=&budgetMonth=], GET /rescue-goals/admin/goals/:id (MANAGER)
 * - POST /rescue-goals (opens a goal; refused unless its money is marked set aside)
 * - PUT  /rescue-goals/:id (wording, picture, end date, proof owner)
 * - POST /rescue-goals/:id/deliver (multipart: photo, receipt, note, txHash)
 * - POST /rescue-goals/:id/cancel (reason; every give is refunded)
 * - GET  /rescue-goals/admin/goals/:id/receipt (the private receipt)
 * Every call sends the lowercase `accesstoken` header.
 */

/** Backend codes (rescue-goal.constants.ts RESCUE_GOAL_ERROR) and what to tell the manager. */
export const RESCUE_GOAL_ERROR_MESSAGES: Record<string, string> = {
  GOAL_NOT_FOUND: 'This goal does not exist.',
  GOAL_FUNDING_REQUIRED:
    'A goal opens only once its money is set aside. Fill in the funding line and amount and tick the box.',
  GOAL_BUDGET_FULL:
    'This budget month already holds 10 goals. Pick another month or cancel one.',
  GOAL_HOUSE_SHELTER: 'Goals are for partner shelters, not Token Tails zones.',
  GOAL_NOT_DELIVERABLE: 'Only an open or filled goal can be delivered.',
  GOAL_NOT_CANCELLABLE: 'A delivered or cancelled goal cannot be cancelled.',
  GOAL_NOT_EDITABLE: 'A delivered or cancelled goal cannot be edited.',
  GUEST_FORBIDDEN: 'Sign in with a manager account.'
};

export function goalErrorText(error: ApiError): string {
  if (error.status === 403 && !error.code) {
    return 'Only managers can change Rescue Goals.';
  }
  return (
    (error.code && RESCUE_GOAL_ERROR_MESSAGES[error.code]) ||
    error.message ||
    `Request failed (${error.status})`
  );
}

export type GoalFilter = 'ALL' | 'OPEN' | 'FILLED' | 'DELIVERED' | 'CANCELLED';

const enc = encodeURIComponent;
const admin = '/rescue-goals/admin/goals';

/** Only the keys with a value, trimmed (empty optional fields are left out, not sent blank). */
export function compact<T extends object>(input: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string') {
      if (value.trim() !== '') out[key] = value.trim();
      continue;
    }
    out[key] = value;
  }
  return out as Partial<T>;
}

export interface IDeliveryInput {
  photo: File;
  receipt: File;
  note?: string;
  txHash?: string;
}

export const RESCUE_GOALS_API = {
  list: (filter: { status?: GoalFilter; budgetMonth?: string } = {}) => {
    const query = new URLSearchParams(
      Object.entries(filter).filter(([, v]) => !!v && v !== 'ALL') as [
        string,
        string
      ][]
    ).toString();
    return send<IRescueGoal[]>(`${admin}${query ? `?${query}` : ''}`, 'GET');
  },
  get: (id: string) => send<IRescueGoal>(`${admin}/${enc(id)}`, 'GET'),
  create: (input: IRescueGoalInput) =>
    send<IRescueGoal>('/rescue-goals', 'POST', compact(input)),
  /** Sends only the given keys; an empty string clears an optional field. */
  update: (id: string, input: IRescueGoalUpdate) =>
    send<IRescueGoal>(`/rescue-goals/${enc(id)}`, 'PUT', input),
  deliver: (id: string, input: IDeliveryInput) => {
    const form = new FormData();
    form.append('photo', input.photo);
    form.append('receipt', input.receipt);
    if (input.note?.trim()) form.append('note', input.note.trim());
    if (input.txHash?.trim()) form.append('txHash', input.txHash.trim());
    return send<IRescueGoal>(`/rescue-goals/${enc(id)}/deliver`, 'POST', form);
  },
  cancel: (id: string, reason: string) =>
    send<IRescueGoal>(`/rescue-goals/${enc(id)}/cancel`, 'POST', {
      reason: reason.trim()
    }),
  /** The private receipt as an object URL. Revoke it when done. */
  receiptUrl: async (id: string): Promise<string | null> => {
    await waitForLocalStorageKey();
    const response = await fetch(`${apiUrl}${admin}/${enc(id)}/receipt`, {
      headers: { ...getAuthHeaders() }
    }).catch(() => null);
    if (!response?.ok) return null;
    return URL.createObjectURL(await response.blob());
  }
};

export type GoalResult = ApiResult<IRescueGoal>;
