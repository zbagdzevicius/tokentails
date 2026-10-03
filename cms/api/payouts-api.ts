import { apiUrl, getAuthHeaders, waitForLocalStorageKey } from './api';

/*
 * Payout attestation (plan G4) for the CMS. Backed by:
 * - GET/POST /impact/payouts, GET/PUT /impact/payouts/:id, POST /impact/payouts/:id/void (MANAGER)
 * - POST /impact/payouts/:id/confirm: a shelter member who did not write the draft, with the receipt
 * - POST /impact/payouts/:id/signature: the handed-over shelter wallet's EIP-191 signature
 * - GET/PUT /shelter/:id/members (ADMIN): who may confirm
 * Every call sends the lowercase `accesstoken` header.
 */

export const PAYOUT_PURPOSES = [
  'outcome',
  'purchase-pledge',
  'general'
] as const;
export type PayoutPurpose = (typeof PAYOUT_PURPOSES)[number];
export const PAYOUT_PURPOSE_LABELS: Record<PayoutPurpose, string> = {
  outcome: 'Outcome (treatment, food…)',
  'purchase-pledge': 'Purchase pledge',
  general: 'General support'
};

export const PAYOUT_METHODS = [
  'bank-transfer',
  'card',
  'cash',
  'onchain',
  'in-kind'
] as const;
export type PayoutMethod = (typeof PAYOUT_METHODS)[number];
export const PAYOUT_METHOD_LABELS: Record<PayoutMethod, string> = {
  'bank-transfer': 'Bank transfer',
  card: 'Card',
  cash: 'Cash',
  onchain: 'On-chain',
  'in-kind': 'In kind'
};

export type PayoutStatus =
  | 'DRAFT'
  | 'SHELTER_CONFIRMED'
  | 'SHELTER_SIGNED'
  | 'VOID';

export const PAYOUT_STATUS_LABELS: Record<PayoutStatus, string> = {
  DRAFT: 'Draft',
  SHELTER_CONFIRMED: 'Shelter-confirmed',
  SHELTER_SIGNED: 'Shelter-signed',
  VOID: 'Void'
};

/** Backend error codes (impact/payouts.service.ts PAYOUT_ERROR) and what to tell the reviewer. */
export const PAYOUT_ERROR_MESSAGES: Record<string, string> = {
  PAYOUT_AUTHOR_CANNOT_CONFIRM:
    'You wrote or edited this draft. Another member of the shelter must confirm it.',
  PAYOUT_STAFF_CANNOT_CONFIRM:
    'Token Tails staff cannot confirm a payout. A member of the shelter must.',
  PAYOUT_NOT_A_MEMBER: 'Only a member of this shelter can confirm it.',
  PAYOUT_RECEIPT_MISMATCH:
    'This file is not the receipt attached to the draft. Nothing was confirmed.',
  PAYOUT_STALE_ATTESTATION:
    'The draft changed since you opened it. Reload and review it again.',
  PAYOUT_NOT_DRAFT: 'This payout is no longer a draft.',
  PAYOUT_BAD_SIGNATURE:
    'The signature is not the shelter wallet signing this exact text.',
  PAYOUT_HANDOVER_PENDING:
    'Signatures open once the shelter holds its own wallet key.'
};

export interface IPayout {
  id: string;
  shelter: {
    _id: string;
    slug: string;
    name: string;
    handoverStatus: string | null;
  };
  status: PayoutStatus;
  tier: 'shelter-confirmed' | 'shelter-signed' | null;
  purpose: PayoutPurpose;
  amountWei: string;
  amount: string;
  symbol: string;
  paidAt: string;
  method: PayoutMethod;
  pledgeMonth: string | null;
  usdEquivalent: { cents: number; fxDate: string; fxSource: string } | null;
  reference: string | null;
  txHash: string | null;
  receipt: { sha256: string; size: number; mime: string; uploadedAt: string };
  attestationHash: string;
  attestationMessage: string;
  createdByMe: boolean;
  /** The caller edited the draft; editors cannot confirm it either. */
  editedByMe?: boolean;
  confirmedAt: string | null;
  signature: { signer: string; signedAt: string } | null;
  canConfirm: boolean;
  canSign: boolean;
  createdAt: string | null;
}

/** Form fields of a draft; all strings, as the multipart body sends them. */
export interface IPayoutInput {
  shelter?: string;
  purpose?: PayoutPurpose;
  amount?: string;
  symbol?: string;
  paidAt?: string;
  method?: PayoutMethod;
  pledgeMonth?: string;
  usdCents?: string;
  fxDate?: string;
  fxSource?: string;
  reference?: string;
  txHash?: string;
}

export interface IShelterMember {
  _id: string;
  name: string;
  emailVerified: boolean;
}

export interface ApiError {
  status: number;
  code: string | null;
  message: string;
}

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError };

/** The message to show for a failed call: the code's text, else the server's message. */
export function errorText(error: ApiError): string {
  return (
    (error.code && PAYOUT_ERROR_MESSAGES[error.code]) ||
    error.message ||
    `Request failed (${error.status})`
  );
}

/**
 * fetch with the auth header that returns the error body instead of swallowing it, so the reviewer
 * sees why a confirmation was refused. `body` is JSON or a FormData (multipart).
 */
export async function send<T>(
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  body?: unknown
): Promise<ApiResult<T>> {
  await waitForLocalStorageKey();
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  try {
    const response = await fetch(`${apiUrl}${path}`, {
      method,
      body:
        body === undefined
          ? undefined
          : isForm
            ? (body as FormData)
            : JSON.stringify(body),
      headers: {
        Accept: 'application/json',
        ...(isForm || body === undefined
          ? {}
          : { 'Content-Type': 'application/json' }),
        ...getAuthHeaders()
      }
    });
    const text = await response.text();
    let parsed: { code?: string; message?: string | string[] } | null = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    if (response.ok) {
      return { ok: true, data: parsed as unknown as T };
    }
    const message = Array.isArray(parsed?.message)
      ? parsed.message.join(', ')
      : String(parsed?.message || text || response.statusText || '');
    return {
      ok: false,
      error: { status: response.status, code: parsed?.code || null, message }
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        status: 0,
        code: null,
        message: (error as Error)?.message || 'Network error'
      }
    };
  }
}

/** Lowercase hex SHA-256 of a file, computed in the browser (the backend computes the same). */
export async function sha256OfFile(file: Blob): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function formOf(input: IPayoutInput, receipt?: File | null): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      form.append(key, String(value).trim());
    }
  }
  if (receipt) {
    form.append('receipt', receipt);
  }
  return form;
}

const enc = encodeURIComponent;

export const PAYOUTS_API = {
  list: (filter: { shelter?: string; status?: string } = {}) => {
    const query = new URLSearchParams(
      Object.entries(filter).filter(([, v]) => !!v) as [string, string][]
    ).toString();
    return send<IPayout[]>(`/impact/payouts${query ? `?${query}` : ''}`, 'GET');
  },
  get: (id: string) => send<IPayout>(`/impact/payouts/${enc(id)}`, 'GET'),
  create: (input: IPayoutInput, receipt: File) =>
    send<IPayout>('/impact/payouts', 'POST', formOf(input, receipt)),
  update: (id: string, input: IPayoutInput, receipt?: File | null) =>
    send<IPayout>(`/impact/payouts/${enc(id)}`, 'PUT', formOf(input, receipt)),
  void: (id: string) =>
    send<IPayout>(`/impact/payouts/${enc(id)}/void`, 'POST'),
  confirm: (id: string, attestationHash: string, receipt: File) => {
    const form = new FormData();
    form.append('attestationHash', attestationHash);
    form.append('receipt', receipt);
    return send<IPayout>(`/impact/payouts/${enc(id)}/confirm`, 'POST', form);
  },
  sign: (id: string, signature: string) =>
    send<IPayout>(`/impact/payouts/${enc(id)}/signature`, 'POST', {
      signature: signature.trim()
    }),
  members: (shelterId: string) =>
    send<IShelterMember[]>(`/shelter/${enc(shelterId)}/members`, 'GET'),
  changeMembers: (
    shelterId: string,
    change: { add?: string[]; remove?: string[] }
  ) =>
    send<IShelterMember[]>(`/shelter/${enc(shelterId)}/members`, 'PUT', change)
};

/** "40.00 EUR" from the decimal string the backend returns. */
export function formatAmount(amount: string, symbol: string): string {
  const [whole, frac = ''] = String(amount || '0').split('.');
  return `${whole}.${(frac + '00').slice(0, 2)} ${symbol}`;
}
