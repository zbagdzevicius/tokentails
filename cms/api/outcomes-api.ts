import type {
  IOutcome,
  IOutcomeInput,
  IRedactionRegion
} from '@/models/outcome';
import { apiUrl, getAuthHeaders, waitForLocalStorageKey } from './api';
import { send } from './payouts-api';

/*
 * Shelter outcomes (plan G11, decision #78) for the CMS. Backed by /impact/outcomes/manage (MANAGER):
 * drafting, the server's redaction pipeline (metadata stripped, boxes pixelated), the redaction
 * checkbox and the second-reviewer approval that publishes. The public list is GET /impact/outcomes.
 */

export const OUTCOME_ERROR_MESSAGES: Record<string, string> = {
  OUTCOME_SAME_REVIEWER:
    'A second reviewer must approve: not the author and not the person who did the redaction check.',
  OUTCOME_NOT_REDACTED: 'Tick the redaction check before approving.',
  OUTCOME_PUBLISHED: 'Unpublish it before editing.'
};

const enc = encodeURIComponent;
const base = '/impact/outcomes/manage';

export const OUTCOMES_API = {
  list: (status?: 'published' | 'unpublished') =>
    send<IOutcome[]>(`${base}${status ? `?status=${status}` : ''}`, 'GET'),
  get: (id: string) => send<IOutcome>(`${base}/${enc(id)}`, 'GET'),
  create: (input: IOutcomeInput) => send<IOutcome>(base, 'POST', input),
  update: (id: string, input: IOutcomeInput) =>
    send<IOutcome>(`${base}/${enc(id)}`, 'PUT', input),
  setImage: (id: string, file: File, regions: IRedactionRegion[]) => {
    const form = new FormData();
    form.append('file', file);
    form.append('regions', JSON.stringify(regions));
    return send<IOutcome>(`${base}/${enc(id)}/image`, 'POST', form);
  },
  removeImage: (id: string) =>
    send<IOutcome>(`${base}/${enc(id)}/image`, 'DELETE'),
  setRedacted: (id: string, redacted: boolean) =>
    send<IOutcome>(`${base}/${enc(id)}/redaction`, 'PUT', { redacted }),
  approve: (id: string) => send<IOutcome>(`${base}/${enc(id)}/approve`, 'POST'),
  unpublish: (id: string) =>
    send<IOutcome>(`${base}/${enc(id)}/unpublish`, 'POST'),
  /** The processed (redacted) image as an object URL, for the reviewers. Revoke it when done. */
  imageUrl: async (id: string): Promise<string | null> => {
    await waitForLocalStorageKey();
    const response = await fetch(`${apiUrl}${base}/${enc(id)}/image`, {
      headers: { ...getAuthHeaders() }
    }).catch(() => null);
    if (!response?.ok) return null;
    return URL.createObjectURL(await response.blob());
  }
};

/** Clamps a drawn box to the image and drops boxes too small to matter. */
export function normalizeRegion(
  start: { x: number; y: number },
  end: { x: number; y: number }
): IRedactionRegion | null {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const x = clamp(Math.min(start.x, end.x));
  const y = clamp(Math.min(start.y, end.y));
  const w = clamp(Math.max(start.x, end.x)) - x;
  const h = clamp(Math.max(start.y, end.y)) - y;
  return w < 0.01 || h < 0.01 ? null : { x, y, w, h };
}
