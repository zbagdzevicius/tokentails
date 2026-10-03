import { createHash } from 'crypto';
import { formatUnits, verifyMessage } from 'ethers';

/*
 * Payout attestation (plan G4 "Attestation", F7.2 tiers). Pure functions.
 *
 * - SHELTER-CONFIRMED (amber): a DRAFT payout carries the server-computed SHA-256 of its receipt and an
 *   attestation hash over every field the confirmer sees. A shelter member (never the draft author)
 *   confirms by uploading the same receipt and sending the attestation hash they reviewed, so a
 *   different receipt or a draft edited after review cannot be confirmed.
 * - SHELTER-SIGNED (green): after the shelter's key handover, the shelter's public wallet signs the
 *   attestation message (EIP-191 personal_sign), checked with `ethers.verifyMessage`.
 *
 * Receipts are hashed, never stored: they can carry names and bank details.
 */

export const PAYOUT_STATUSES = ['DRAFT', 'SHELTER_CONFIRMED', 'SHELTER_SIGNED', 'VOID'] as const;
export type PayoutStatus = typeof PAYOUT_STATUSES[number];

export const PAYOUT_PURPOSES = ['outcome', 'purchase-pledge', 'general'] as const;
export type PayoutPurpose = typeof PAYOUT_PURPOSES[number];

export const PAYOUT_METHODS = ['bank-transfer', 'card', 'cash', 'onchain', 'in-kind'] as const;
export type PayoutMethod = typeof PAYOUT_METHODS[number];

/** Public evidence tier ids, as in client/components/claims/tiers.ts. */
export type AttestationTier = 'shelter-confirmed' | 'shelter-signed';

export function tierOf(status: PayoutStatus | string | null | undefined): AttestationTier | null {
    return status === 'SHELTER_SIGNED' ? 'shelter-signed' : status === 'SHELTER_CONFIRMED' ? 'shelter-confirmed' : null;
}

export function sha256Hex(data: Buffer | string): string {
    return createHash('sha256').update(data).digest('hex');
}

export interface AttestationFields {
    publicId: string;
    shelterSlug: string;
    /** Integer string, 18 decimals. */
    amount: string;
    symbol: string;
    paidAt: Date | string;
    method: PayoutMethod | string;
    purpose: PayoutPurpose | string;
    pledgeMonth?: string | null;
    usdEquivalent?: { cents: number; fxDate: string; fxSource: string } | null;
    reference?: string | null;
    txHash?: string | null;
    receiptSha256: string;
}

const day = (value: Date | string) => new Date(value).toISOString().slice(0, 10);

/** The exact text a confirmer reviews and a shelter wallet signs. One field per line, fixed order. */
export function attestationMessage(fields: AttestationFields): string {
    const lines = [
        'Token Tails payout attestation',
        `Payout: ${fields.publicId}`,
        `Shelter: ${fields.shelterSlug}`,
        `Amount: ${formatUnits(BigInt(fields.amount), 18)} ${fields.symbol}`,
        `Paid on: ${day(fields.paidAt)}`,
        `Method: ${fields.method}`,
        `Purpose: ${fields.purpose}${fields.pledgeMonth ? ` ${fields.pledgeMonth}` : ''}`,
    ];
    if (fields.usdEquivalent) {
        const { cents, fxDate, fxSource } = fields.usdEquivalent;
        lines.push(`USD equivalent: ${(cents / 100).toFixed(2)} (FX ${fxDate}, ${fxSource})`);
    }
    if (fields.reference) {
        lines.push(`Reference: ${fields.reference}`);
    }
    if (fields.txHash) {
        lines.push(`Transaction: ${fields.txHash}`);
    }
    lines.push(`Receipt SHA-256: ${fields.receiptSha256}`);
    return lines.join('\n');
}

export function attestationHash(fields: AttestationFields): string {
    return sha256Hex(attestationMessage(fields));
}

/** The lowercased signer of an EIP-191 signature over `message`, or null when it does not parse. */
export function recoverSigner(message: string, signature: string): string | null {
    if (typeof signature !== 'string' || !/^0x[0-9a-fA-F]{130}$/.test(signature.trim())) {
        return null;
    }
    try {
        return verifyMessage(message, signature.trim()).toLowerCase();
    } catch {
        return null;
    }
}

/** Text that must never sit in a public payout or outcome field (plan F7.1 generator rule). */
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const IBAN = /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]){10,30}\b/;
const PHONE_LIKE = /\+?\d[\d\s().-]{6,}\d/g;

/** An email, an IBAN, or a run of 9 or more digits written like a phone number. */
export function looksPersonal(text: string | null | undefined): boolean {
    const value = String(text || '');
    if (EMAIL.test(value) || IBAN.test(value.toUpperCase())) {
        return true;
    }
    return (value.match(PHONE_LIKE) || []).some(run => run.replace(/\D/g, '').length >= 9);
}
