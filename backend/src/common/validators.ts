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

/**
 * The client-controlled part of a search body: paging and sort only. The global ValidationPipe has
 * no `whitelist`, so a body typed as SearchModel still carries any extra key the caller sends
 * (`searchObject`, `projection`, `pipelineStages`, `populate`, `collation`). Spreading it into
 * BaseRepository.find let a public caller run its own aggregation stages, for example a `$lookup`
 * into `users`. Search handlers pass this instead of `...params`.
 */
export function pickSearchParams(params?: SearchModel): Pick<SearchModel, 'page' | 'perPage' | 'sort'> {
    const page = Number(params?.page);
    const perPage = Number(params?.perPage);
    const sortBy = params?.sort?.sortBy;
    return {
        page: Number.isInteger(page) && page >= 0 ? page : 0,
        perPage: Number.isInteger(perPage) && perPage > 0 ? perPage : DefaultPerPage,
        sort: {
            sortBy: typeof sortBy === 'string' && /^[A-Za-z_][\w.]*$/.test(sortBy) ? sortBy : 'createdAt',
            isAscending: params?.sort?.isAscending === true,
        },
    };
}
