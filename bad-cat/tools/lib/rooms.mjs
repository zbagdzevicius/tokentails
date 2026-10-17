/** Room ids used by tools (par, validate, og): resolve an id to its PlayableRoom with the game's content module. */

/** RoomDef for a room id ('daily-018', 'preview-003', 'glass', 'kitchen-v4'), or null. */
export function roomDefFor(content, roomId) {
  if (roomId === 'glass') return content.glassRoom();
  let m = /^daily-(\d{3,})$/.exec(roomId);
  if (m) return content.dailyRoom(Number(m[1]));
  m = /^preview-(\d{3,})$/.exec(roomId);
  if (m) return content.dailyRoom(1 - Number(m[1]));
  const v = content.KITCHEN_VARIANTS.find((r) => r.id === roomId);
  return v ? structuredClone(v) : null;
}

/** dayNo of a daily/preview id, else undefined. */
export function dayNoOf(roomId) {
  let m = /^daily-(\d{3,})$/.exec(roomId);
  if (m) return Number(m[1]);
  m = /^preview-(\d{3,})$/.exec(roomId);
  return m ? 1 - Number(m[1]) : undefined;
}

/** Ranked for dailies (par is the ranked score), practice for The Glass and the Kitchen variants. */
export function playableFor(content, roomId) {
  const def = roomDefFor(content, roomId);
  if (!def) return null;
  const dayNo = dayNoOf(roomId);
  return content.resolve(def, dayNo !== undefined ? 'ranked' : 'practice', dayNo);
}

/** Every room id a ghost could belong to (for matching a ghost's room key): glass, variants, previews, days 1..maxDay. */
export function candidateRoomIds(content, maxDay = 730) {
  const ids = ['glass', ...content.KITCHEN_VARIANTS.map((r) => r.id)];
  for (let k = 1; k <= 60; k++) ids.push(`preview-${String(k).padStart(3, '0')}`);
  for (let n = 1; n <= maxDay; n++) ids.push(`daily-${String(n).padStart(3, '0')}`);
  return ids;
}
