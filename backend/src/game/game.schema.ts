import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import * as uniqueValidator from 'mongoose-unique-validator';
import { CommonSchema } from 'src/common/common.schema';

export enum GameType {
    SHELTER = 'SHELTER',
    HOME = 'HOME',
    PURRQUEST = 'PURRQUEST',
    CATBASSADORS = 'CATBASSADORS',
    CATNIP_CHAOS = 'CATNIP_CHAOS',
    PIXEL_RESCUE = 'PIXEL_RESCUE',
    MATCH_3 = 'MATCH_3',
}

export const seasonEventLevels = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14'];
const MATCH3_LEVEL_COUNT = 30;
export const match3Levels = Array.from({ length: MATCH3_LEVEL_COUNT }, (_, index) => String(index + 1));
export const match3LevelCatnipCaps = match3Levels.map((level) => {
    const levelNumber = Number(level);
    const difficulty = levelNumber - 1;
    return Math.max(0, Math.min(85, Math.round(9 + levelNumber * 2 + Math.floor(difficulty / 4))));
});
export const catnipChaosLevels = [
    '01',
    '11',
    '12',
    '13',
    '14',
    '15',
    '16',
    '21',
    '22',
    '23',
    '24',
    '25',
    '26',
    '31',
    '32',
    '33',
    '34',
    '35',
    '36',
    '41',
    '42',
    '43',
    '44',
    '45',
    '46',
    '51',
    '52',
    '53',
    '54',
    '55',
    '56',
    '61',
    '62',
    '63',
    '64',
    '65',
    '66',
    '71',
    '72',
    '73',
    '74',
    '75',
    '76',
    '81',
    '82',
    '83',
    '84',
    '85',
    '86',
    '91',
    '92',
    '93',
    '94',
    '95',
    '96',
    '101',
    '102',
    '103',
    '104',
    '105',
    '106',
    '111',
    '112',
    '113',
    '114',
    '115',
    '116',
    '121',
    '122',
    '123',
    '124',
    '125',
    '126',
    '131',
    '132',
    '133',
    '134',
    '135',
    '136',
    '141',
    '142',
    '143',
    '144',
    '145',
    '146',
    '151',
    '152',
    '153',
    '154',
    '155',
    '156',
    '161',
    '162',
    '163',
    '164',
    '165',
    '166',
];
export const catnipChaosLevelCatnipCaps = catnipChaosLevels.map((_level, index) => (index === 0 ? 420 : 10));
export const totalCatnipChaosCap = catnipChaosLevelCatnipCaps.reduce((acc, cap) => acc + cap, 0);
export const totalMatch3CatnipCap = match3LevelCatnipCaps.reduce((acc, cap) => acc + cap, 0);
export const totalCatnipCap = totalCatnipChaosCap + totalMatch3CatnipCap;

@Schema({ timestamps: true })
export class Game extends CommonSchema {
    @Prop({ required: true })
    type: GameType;

    @Prop()
    points?: number;

    @Prop()
    score?: number;

    @Prop()
    time?: number;

    @Prop()
    level?: string;

    @Prop({ type: Types.ObjectId, ref: 'User' })
    user?: Types.ObjectId;

    @Prop({ type: Types.ObjectId, ref: 'Cat' })
    cat?: Types.ObjectId;
}

export type GameDocument = Game & Document;

export type IGame = Pick<Game, keyof Game>;

export const GameSchema = SchemaFactory.createForClass(Game);
GameSchema.index({ user: 1 });
GameSchema.index({ cat: 1 });
GameSchema.index({ type: 1, score: 1 });
GameSchema.plugin(uniqueValidator);
