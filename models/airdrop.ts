import { AirdropUser } from "@/api/ai-api";

export interface AirdropTableProps {
  scores: AirdropUser[];
  loaderRef: (node?: Element | null) => void;
  isFetchingNextPage: boolean;
  hasNextPage: boolean | undefined;
  onSearch: (username: string) => void;
  isSearching: boolean;
  phase: number;
  setPhase: (phase: number) => void;
}
