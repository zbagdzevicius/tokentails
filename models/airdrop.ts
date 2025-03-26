export type AirdropScore = {
  username: string;
  totalScore: number;
};

export interface AirdropTableProps {
  scores: AirdropScore[];
  loaderRef: (node?: Element | null) => void;
  isFetchingNextPage: boolean;
  hasNextPage: boolean | undefined;
  onSearch: (username: string) => void;
  isSearching: boolean;
}
