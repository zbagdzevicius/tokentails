import { AirdropUser, getAirdropScores, searchUsers } from "@/api/ai-api";
import { AirdropCats } from "@/components/airdrop/AirdropCats";
import AirdropMemes from "@/components/airdrop/AirdropMemes";
import { AirdropRewardsSlider } from "@/components/airdrop/AirdropRewardsSlider";
import { AirdropTable } from "@/components/airdrop/AirdropTable";
import SocialAirdropTerms from "@/components/airdrop/SocialAirdropTerms";
import { PixelButton } from "@/components/shared/PixelButton";
import { Footer } from "@/layouts/Footer";
import { Header } from "@/layouts/Header";
import { useInfiniteQuery } from "@tanstack/react-query";
import Head from "next/head";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useInView } from "react-intersection-observer";

const hiddenUsernames = ["tokentails", "tokentailscat"];

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
  const [section, setSection] = useState<"leaderboard" | "memes" | "cats">(
    "leaderboard"
  );

  const { data, isFetchingNextPage, fetchNextPage, hasNextPage, isLoading } =
    useInfiniteQuery({
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
    const filteredData = data?.pages
      ?.flat()
      .filter(
        (user) =>
          !hiddenUsernames.some((nick) =>
            user.username.toLowerCase().includes(nick.toLowerCase())
          )
      );
    if (searchTerm) {
      return searchResults;
    }

    return filteredData || [];
  }, [data, searchTerm, searchResults]);

  return (
    <div>
      <Head>
        <title>Token Tails - Play to Save</title>
        <meta property="og:image" content="/logo/airdrop.jpg" />
        <meta property="og:title" content="Token Tails - Airdrop" key="title" />
        <meta name="description" content="9 ways to earn $TAILS" />
        <link rel="shortcut icon" href="/logo/coin.webp" />
      </Head>
      <Header />
      <div
        className="pt-20 md:pt-24 fade-in min-h-screen relative flex flex-col items-center"
        style={{
          backgroundImage: "url(/backgrounds/bg-night.gif)",
          backgroundRepeat: "no-repeat",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
        id="social-farmin"
      >
        <SocialAirdropTerms />
        <AirdropRewardsSlider />
      </div>

      <div
        className="pt-20 md:pt-24 fade-in min-h-screen relative flex flex-col items-center justify-center pb-16"
        style={{
          background: "url(/backgrounds/bg-night-2.gif)",
          backgroundAttachment: "fixed",
          backgroundSize: "cover",
          backgroundPosition: "bottom",
        }}
        id="social-farming-results"
      >
        <div className="flex justify-center items-center gap-4">
          <PixelButton
            text="CATS"
            active={section === "cats"}
            onClick={() => setSection("cats")}
          />
          <PixelButton
            text="LEADERBOARD"
            active={section === "leaderboard"}
            onClick={() => setSection("leaderboard")}
          />
          <PixelButton
            text="MEMES"
            active={section === "memes"}
            onClick={() => setSection("memes")}
          />
        </div>

        <div className="flex gap-6 mt-4">
          <div
            style={{
              backgroundImage: "url(/backgrounds/bg-7.png)",
              backgroundSize: "cover",
              backgroundPosition: "top",
            }}
            className="animate-brightness relative border flex flex-col items-center justify-center w-24 h-24 rounded-full hover:brightness-110"
          >
            <div className="z-10 text-center pt-2 rounded-full flex items-center flex-col justify-center text-p4 leading-none font-primary">
              <span className="text-yellow-300 drop-shadow-[0_2.4px_1.8px_rgba(0,0,0)] w-full text-center">
                AIRDROP
              </span>
              <div>CAMPAIGN</div>
            </div>
            <div className="w-14 h-14 -mb-6 rounded-full hover:brightness-110 bg-yellow-300 text-h5 font-primary flex justify-center items-center border-2 border-main-black">
              1
            </div>
          </div>
          <div
            style={{
              backgroundImage: "url(/backgrounds/bg-7.png)",
              backgroundSize: "cover",
              backgroundPosition: "top",
            }}
            className="animate-brightness relative border flex flex-col items-center justify-center w-24 h-24 rounded-full hover:brightness-110 opacity-50 scale-75"
          >
            <div className="z-10 text-center pt-2 rounded-full flex items-center flex-col justify-center text-p4 leading-none font-primary">
              <span className="text-yellow-300 drop-shadow-[0_2.4px_1.8px_rgba(0,0,0)] w-full text-center">
                GUARD
              </span>
              <div>CAMPAIGN</div>
            </div>
            <div className="w-14 h-14 -mb-6 rounded-full hover:brightness-110 bg-yellow-300 text-h5 font-primary flex justify-center items-center border-2 border-main-black">
              2
            </div>
            <div className="absolute inset-0 flex items-center justify-center p-1 w-full h-full z-20 rounded-t-2xl">
              <img className="w-16 h-16" src="/purrquest/sprites/key.png" />
            </div>
          </div>
          <div
            style={{
              backgroundImage: "url(/backgrounds/bg-7.png)",
              backgroundSize: "cover",
              backgroundPosition: "top",
            }}
            className="animate-brightness relative border flex flex-col items-center justify-center w-24 h-24 rounded-full hover:brightness-110 opacity-50 scale-75"
          >
            <div className="z-10 text-center pt-2 rounded-full flex items-center flex-col justify-center text-p4 leading-none font-primary">
              <span className="text-yellow-300 drop-shadow-[0_2.4px_1.8px_rgba(0,0,0)] w-full text-center">
                AWARDS
              </span>
              <div>CAMPAIGN</div>
            </div>
            <div className="w-14 h-14 -mb-6 rounded-full hover:brightness-110 bg-yellow-300 text-h5 font-primary flex justify-center items-center border-2 border-main-black">
              3
            </div>
            <div className="absolute inset-0 flex items-center justify-center p-1 w-full h-full z-20 rounded-t-2xl">
              <img className="w-16 h-16" src="/purrquest/sprites/key.png" />
            </div>
          </div>
        </div>
        {section === "memes" && <AirdropMemes />}
        {section === "cats" && <AirdropCats />}

        {section === "leaderboard" && (
          <AirdropTable
            scores={scores}
            loaderRef={ref}
            isFetchingNextPage={isLoading || isFetchingNextPage}
            hasNextPage={!searchTerm && hasNextPage}
            onSearch={handleSearch}
            isSearching={isSearching}
          />
        )}
      </div>

      <Footer />
    </div>
  );
};

export default Airdrop;
