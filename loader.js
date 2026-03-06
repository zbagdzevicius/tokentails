"use client";

const cdnDomains = [
  "https://armadillo-space",
  "https://sveikauk.fra1.cdn",
  "https://sveikauk-data.fra1.cdn",
  "https://tokentails.fra1.",
  "https://tokentails-nfts.fra1.",
];

export default function myImageLoader({ src, width = 600 }) {
  if (!src?.length) {
    return "";
  }
  if (src?.[0] === "/") {
    // src = `${process.env.NEXT_PUBLIC_DOMAIN}${src}`;
    return src;
  }
  if (!cdnDomains.find((url) => src.includes(url))) {
    return src;
  }
  return src;
}
