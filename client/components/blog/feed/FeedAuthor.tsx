import { feedOptions } from "@/api/routing";
import Image from "next/image";
import Link from "next/link";
import React, { useMemo } from "react";

export interface IFeedAuthorProps {
  author: string;
  authorImage?: string;
  authorSubtitle?: string;
  date: string;
  authorLink: string;
}

export const engagingTexts = [
  "Fur-tastic",
  "Cat Nap",
  "Purr-suit",
  "Meow Mix",
  "Snuggle fur",
  "Meowments",
  "Cat-shy",
  "Pawsitive",
  "Purrfect",
  "Play to Save",
  "Meowgical",
];

// Deterministic string hash, used to spread fallback subtitles across authors.
const pickEngagingText = (key: string) => {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  return engagingTexts[Math.abs(hash) % engagingTexts.length];
};

export const FeedAuthor = ({
  author,
  authorLink,
  date,
  authorImage,
  authorSubtitle,
}: IFeedAuthorProps) => {
  const option = useMemo(
    () => feedOptions.find((option) => authorLink.includes(option.href)),
    [authorLink]
  );
  // Fallback subtitle derived from stable props, so the server render and
  // hydration pick the same text (Math.random() here caused a mismatch).
  const fallbackText = useMemo(
    () => pickEngagingText(`${authorLink}|${author}|${date}`),
    [authorLink, author, date]
  );
  const randomText = authorSubtitle ? authorSubtitle : fallbackText;

  return (
    <Link
      href={`/feed/${authorLink}`.replace("//", "/")}
      className="flex items-center justify-between px-4 py-2"
    >
      <div className="flex space-x-2 items-center">
        {authorImage ? (
          <Image
            className="w-10 h-10 rounded-full"
            width={240}
            height={240}
            src={authorImage}
            alt={author}
          />
        ) : (
          <span className="w-10 h-10 text-h5 rounded-full grid place-items-center bg-gray-300">
            <i className={`bx text-gray-500 ${option?.icon}`}></i>
          </span>
        )}
        <div className="flex flex-col justify-center">
          <div className="font-semibold font-primary uppercase text-gray-600">
            {author}
          </div>
          <span className="text-sm text-gray-500 text-p4">{randomText}</span>
        </div>
      </div>
    </Link>
  );
};
