import { getRandomInt, insertObjectEveryN } from "@/constants/utils";
import React, { useMemo } from "react";

const baseUrl =
  "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/memes/gallery/meme_";
const catBaseUrl =
  "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/memes/cats/cat_";

export const AirdropMemes = () => {
  const memes = useMemo(
    () =>
      Array.from(
        { length: 100 },
        (_, index) => `${baseUrl}${index + getRandomInt(300) + 1}.jpg`
      ),
    []
  );
  const memesWithCats = useMemo(() => {
    const memesArray = [...memes];
    return insertObjectEveryN(
      memesArray,
      5,
      () => `${catBaseUrl}${getRandomInt(29) + 1}.jpg`
    );
  }, [memes]);

  return (
    <div className="masonry-grid columns-2 md:columns-4 gap-4 space-y-4 max-w-4xl mt-8">
      {memesWithCats.map((meme, index) => (
        <div key={index} className="break-inside-avoid">
          <img
            className="w-full h-auto rounded-lg"
            src={meme}
            alt={`meme-${index}`}
            loading="lazy"
          />
        </div>
      ))}
    </div>
  );
};

export default AirdropMemes;
