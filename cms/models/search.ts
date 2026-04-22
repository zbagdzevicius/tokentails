export interface ISort {
    sortBy?: string;
    isAscending?: boolean;
}

export interface ISearch {
    page: number;
    perPage?: number;
    query?: string;
    sort?: ISort;
}

export interface IBlessingSearch extends ISearch {
    shelter: string;
}