import { Type } from 'class-transformer';
import { IsInt, IsOptional } from 'class-validator';
import { DefaultPerPage } from './constants';

export class SortingModel {
    @Type(() => Object)
    sortBy?: string = 'createdAt';

    @Type(() => Boolean)
    isAscending?: boolean = false;
}

export class SearchModel {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    page? = 0;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    perPage?: number = DefaultPerPage;

    @IsOptional()
    @Type(() => String)
    query?: string;

    @IsOptional()
    @Type(() => SortingModel)
    sort?: SortingModel = new SortingModel();
}

export class BlessingSearchModel extends SearchModel {
    @IsOptional()
    @Type(() => String)
    shelter?: string;
}
