/**
 * Daily reminder as an .ics file (GDD 8 "return reasons without an app"): one VEVENT that repeats daily at the
 * player's chosen local time (floating time, so it follows the phone's time zone and DST), a VALARM at the
 * start, and the game link. RFC 5545: CRLF line ends, lines folded at 75 octets, TEXT values escaped.
 * No email, no server, no push.
 */

export const ICS_MIME = 'text/calendar;charset=utf-8';

/** "HH:MM" (24 h) or null. */
export function parseReminderTime(time: string): { h: number; m: number } | null {
  const m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(time ?? '');
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return { h, m: min };
}

/** Escape a TEXT value (RFC 5545 3.3.11). */
export function icsEscape(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');
}

/** Fold one content line at 75 octets (UTF-8), continuation lines start with one space. */
export function icsFold(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let cur = '';
  let curBytes = 0;
  let limit = 75;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (curBytes + b > limit) {
      parts.push(cur);
      cur = '';
      curBytes = 0;
      limit = 74; // the leading space takes one octet
    }
    cur += ch;
    curBytes += b;
  }
  parts.push(cur);
  return parts.join('\r\n ');
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');
const utcStamp = (d: Date) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

export interface IcsOptions {
  now?: Date;
  title?: string;
  description?: string;
  uid?: string;
}

/**
 * The calendar text. The first occurrence is today at `time` if that is still ahead, else tomorrow.
 * Invalid times fall back to 19:00 (the reminder still works).
 */
export function icsText(time: string, url: string, opts: IcsOptions = {}): string {
  const now = opts.now ?? new Date();
  const t = parseReminderTime(time) ?? { h: 19, m: 0 };
  const first = new Date(now.getFullYear(), now.getMonth(), now.getDate(), t.h, t.m, 0, 0);
  if (first.getTime() <= now.getTime()) first.setDate(first.getDate() + 1);
  const local = `${first.getFullYear()}${pad(first.getMonth() + 1)}${pad(first.getDate())}T${pad(t.h)}${pad(t.m)}00`;
  const end = new Date(first.getTime() + 10 * 60_000);
  const localEnd = `${end.getFullYear()}${pad(end.getMonth() + 1)}${pad(end.getDate())}T${pad(end.getHours())}${pad(end.getMinutes())}00`;
  const title = opts.title ?? 'Bad Cat Daily: a new room is waiting 🐾';
  const desc = opts.description ?? `Today's room is open. Knock something off a counter: ${url}`;
  const uid = opts.uid ?? `badcat-daily-${pad(t.h)}${pad(t.m)}@tokentails.com`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Token Tails//Bad Cat Daily//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART:${local}`,
    `DTEND:${localEnd}`,
    'RRULE:FREQ=DAILY',
    `SUMMARY:${icsEscape(title)}`,
    `DESCRIPTION:${icsEscape(desc)}`,
    `URL:${url.replace(/[\r\n]/g, '')}`,
    'TRANSP:TRANSPARENT',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${icsEscape('Your cat is getting ideas. One run, 75 seconds.')}`,
    'TRIGGER:PT0M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(icsFold).join('\r\n') + '\r\n';
}

/** The .ics as a Blob (browser) for a download link. */
export function icsReminder(time: string, url: string, opts: IcsOptions = {}): Blob {
  return new Blob([icsText(time, url, opts)], { type: ICS_MIME });
}
