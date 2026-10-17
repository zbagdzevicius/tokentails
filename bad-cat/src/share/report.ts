/**
 * "Hide and report" (GDD 6.7): the UI hides the room or ghost locally and sends `ugc_reported` with the payload
 * hash (only when analytics consent is granted; the platform's track() checks consent).
 */
import { payloadHash } from '../codec';

export type ReportKind = 'room' | 'ghost' | 'dare' | 'name';

/** Props of the `ugc_reported` event. */
export function reportProps(payloadHashValue: string, kind: ReportKind): { payload_hash: string; kind: ReportKind } {
  return { payload_hash: String(payloadHashValue).slice(0, 16), kind };
}

/** Hash a raw link payload (room code or ghost) and build the event props. */
export function reportPayload(payload: string, kind: ReportKind): { payload_hash: string; kind: ReportKind } {
  return reportProps(payloadHash(payload), kind);
}
