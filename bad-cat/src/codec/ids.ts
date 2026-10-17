/** Room id conventions shared by content and the link/ghost codecs. */

/** 'daily-018' for day 18; pre-launch preview days (dayNo <= 0) are 'preview-001' for day 0, 'preview-002' for -1 ... */
export function dailyRoomId(dayNo: number): string {
  return dayNo >= 1 ? `daily-${String(dayNo).padStart(3, '0')}` : `preview-${String(1 - dayNo).padStart(3, '0')}`;
}

export const GLASS_ROOM_ID = 'glass';

/** FNV-1a 32-bit over the UTF-16 code units of a room id: the ghost's room key. */
export function roomKey(roomId: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < roomId.length; i++) {
    h ^= roomId.charCodeAt(i) & 0xff;
    h = Math.imul(h, 0x01000193);
    h ^= roomId.charCodeAt(i) >>> 8;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
