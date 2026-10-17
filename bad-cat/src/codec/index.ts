/** L2 Codec public API (GDD 6.6, 6.7). */
import type { CodecApi } from '../types';
import { decodeCat, encodeCat } from './cat-codec';
import { creatorCode, payloadHash } from './creator-code';
import { buildLink, buildLinkAsync, parseLink, parseLinkFull } from './link';
import { decodeRoom, encodeRoom } from './room-codec';
import { filterName } from './text-filter';

export { encodeCat, decodeCat, decodeCatOrDefault, CAT_CODE_LENGTH, CAT_CODE_VERSION } from './cat-codec';
export {
  parseLink,
  parseLinkFull,
  buildLink,
  buildLinkAsync,
  linkGhostParams,
  linkRoomId,
  routeParams,
  daySlug,
  parseDaySlug,
  LINK_ROUTES,
  ROUTE_PARAMS,
  type LinkStateX,
  type RawGhostParam,
} from './link';
export { filterName, filterTitle, filterText, isBlocked, NAME_EMOJI } from './text-filter';
export {
  encodeGhost,
  decodeGhost,
  encodeGhostSync,
  decodeGhostSync,
  isDeflatedGhost,
  GHOST_MAX_TICKS,
  GHOST_VERSION,
  type DecodedGhost,
} from './ghost-codec';
export {
  encodeRoom,
  decodeRoom,
  roomGameplayHash,
  ROOM_CODE_VERSION,
  ROOM_THEMES,
  ROOM_MAX_PROPS,
  ROOM_TITLE_MAX,
  ROOM_NAME_MAX,
  ROOM_MAX_ANCESTORS,
} from './room-codec';
export { creatorCode, payloadHash } from './creator-code';
export { dailyRoomId, GLASS_ROOM_ID, roomKey } from './ids';
export { BitReader, BitWriter } from './bits';
export { toBase64url, fromBase64url } from './base64url';
export { crc16, crc32 } from './crc16';

export const codec: CodecApi = {
  encodeCat,
  decodeCat,
  parseLink,
  parseLinkFull,
  buildLink,
  buildLinkAsync,
  filterName,
  encodeRoom,
  decodeRoom,
  payloadHash,
  creatorCode,
};
