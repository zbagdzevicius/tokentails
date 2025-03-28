import { getRandomInt, insertObjectEveryN } from "@/constants/utils";
import React, { useMemo } from "react";

const baseUrl =
  "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/memes/gallery/meme_";
const catBaseUrl =
  "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/memes/cats/cat_";
const avatarBaseUrl =
  "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/memes/avatars/avatar_";

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
    const withCats = insertObjectEveryN(
      memesArray,
      8,
      () => `${catBaseUrl}${getRandomInt(29) + 1}.jpg`
    );
    const withAvatars = insertObjectEveryN(
      withCats,
      5,
      () => `${avatarBaseUrl}${getRandomInt(10)}.jpg`
    );
    return withAvatars;
  }, [memes]);
  const random4Avatars = useMemo(() => {
    return Array.from(
      { length: 4 },
      (_, index) => `${avatarBaseUrl}${index + getRandomInt(9)}.jpg`
    );
  }, []);

  return (
    <div className="flex flex-col gap-4 mt-8 max-w-4xl">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {random4Avatars.map((avatar, index) => (
          <div key={index} className="break-inside-avoid">
            <img
              className="w-full h-auto rounded-lg"
              src={avatar}
              alt={`avatar-${index}`}
              loading="lazy"
            />
          </div>
        ))}
      </div>
      <div className="masonry-grid columns-2 md:columns-4 gap-4 space-y-4">
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
    </div>
  );
};

export default AirdropMemes;
