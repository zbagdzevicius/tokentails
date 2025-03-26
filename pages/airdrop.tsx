import { useEffect, useMemo, useState, useCallback } from "react";
import { useInView } from "react-intersection-observer";
import { useInfiniteQuery } from "@tanstack/react-query";
import { AirdropUser, getAirdropScores, searchUsers } from "@/api/ai-api";
import { AirdropTable } from "@/components/airdrop/AirdropTable"
import { Loader } from "@/components/shared/Loader";
import AirdropLayout from "@/layouts/AirdropLayout";

const hiddenUsernames = ['tokentails', 'tokentailscat']

function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout;
    return (...args: Parameters<T>) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

const Airdrop = () => {
    const [searchTerm, setSearchTerm] = useState("");
    const [isSearching, setIsSearching] = useState(false);
    const [searchResults, setSearchResults] = useState<AirdropUser[]>([]);

    const {
        data,
        isFetchingNextPage,
        fetchNextPage,
        hasNextPage,
        isLoading,
    } = useInfiniteQuery({
        queryKey: ["airdrop"],
        queryFn: ({ pageParam = 0 }) => getAirdropScores({ pageParam }),
        initialPageParam: 0,
        getNextPageParam: (lastPage, allPages) => {
            if (!lastPage || lastPage.length === 0) return undefined;
            return allPages.length;
        },
        enabled: !searchTerm,
    });

    const { ref, inView } = useInView();

    useEffect(() => {
        if (inView && hasNextPage && !searchTerm) {
            fetchNextPage();
        }
    }, [inView, hasNextPage, fetchNextPage, searchTerm]);

    const debouncedSearch = useCallback(
        debounce(async (term: string) => {
            if (!term.trim()) {
                setSearchTerm("");
                setSearchResults([]);
                return;
            }

            setSearchTerm(term);
            setIsSearching(true);
            try {
                const results = await searchUsers(term);
                setSearchResults(results || []);
            } catch (error) {
                setSearchResults([]);
            } finally {
                setIsSearching(false);
            }
        }, 300),
        []
    );

    const handleSearch = (username: string) => {
        debouncedSearch(username);
    };

    const scores = useMemo(() => {
        const filteredData = data?.pages?.flat().filter(
            (user) =>
                !hiddenUsernames.some((nick) =>
                    user.username.toLowerCase().includes(nick.toLowerCase())
                )
        )
        if (searchTerm) {
            return searchResults;
        }

        return filteredData || [];
    }, [data, searchTerm, searchResults]);

    if (isLoading) return <Loader />;

    return (
        <AirdropLayout>
            <div >
                <div className="flex md:flex-row flex-col items-center ">
                    <div className="flex flex-col gap-3 max-w-md mb-10 py-2 ">
                        <span className="text-p5 lg:text-p4 text-gray-800 py-2">
                            To earn a spot, engage with our posts and share about <strong>TAILS</strong> on X — don’t forget to tag <span className="text-blue-600 font-semibold"><a href="https://x.com/tokentails" target="_blank">@Tokentails</a></span>!
                        </span>

                        <span className="text-p6 lg:text-p5 text-gray-600">
                            Higher ranks improve your chances, but don’t guarantee a spot. All applications are manually reviewed. Any attempts to game the system will result in disqualification.
                        </span>
                    </div>

                    <img
                        src="airdrop/leaderboard-cat.webp"
                        alt="Leaderboard Cat"
                        className="md:w-60 object-contain"
                    />
                </div>
                <AirdropTable
                    scores={scores}
                    loaderRef={ref}
                    isFetchingNextPage={isFetchingNextPage}
                    hasNextPage={!searchTerm && hasNextPage}
                    onSearch={handleSearch}
                    isSearching={isSearching}
                />
            </div>
        </AirdropLayout>
    );
};

export default Airdrop;
