/**
 * Every champion's sound and motif layer (audio/champ/<hero>.ts), one file per hero so parallel work never shares a
 * file. Add a hero: write its file and add it here (the test checks all 20).
 */
import type { HeroId } from '../../data/heroes/types';
import type { ChampAudio } from './types';
import { clem } from './clem';
import { sage } from './sage';
import { brutus } from './brutus';
import { cacklejaw } from './cacklejaw';
import { lambo } from './lambo';
import { aviete } from './aviete';
import { bengas } from './bengas';
import { gabe } from './gabe';
import { meatball } from './meatball';
import { pixel } from './pixel';
import { duchess } from './duchess';
import { stilts } from './stilts';
import { nugget } from './nugget';
import { marshmallow } from './marshmallow';
import { bravo } from './bravo';
import { chili } from './chili';
import { howler } from './howler';
import { rocket } from './rocket';
import { frankie } from './frankie';
import { domino } from './domino';

export type { ChampAudio, ChampFx, MotifPainter, SkillPhase, SkillSound, SkillSoundOverride } from './types';

export const CHAMP_AUDIO: Readonly<Record<HeroId, ChampAudio>> = Object.freeze({
  clem,
  sage,
  brutus,
  cacklejaw,
  lambo,
  aviete,
  bengas,
  gabe,
  meatball,
  pixel,
  duchess,
  stilts,
  nugget,
  marshmallow,
  bravo,
  chili,
  howler,
  rocket,
  frankie,
  domino,
});
