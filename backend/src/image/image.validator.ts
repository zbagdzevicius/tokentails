import { Type } from 'class-transformer';
import { IsString } from 'class-validator';

export class ImageModel {
    @Type(() => String)
    @IsString()
    caption: string;

    @Type(() => String)
    @IsString()
    title: string;

    isOriginal?: boolean;
}
