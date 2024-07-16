import Head from "next/head";
import React, { useEffect } from "react";

export default function giveaway() {
  useEffect(() => {
    window.location.href = 'https://x.com/tokentails/status/1806277853970825543'
  }, [])
  return (
    <>
      <Head>
        <title>Token Tails - Play to Save</title>
        <meta property="og:image" content="/airdrop-3.jpg" />
        <meta property="og:title" content="Token Tails Meme contest" key="title" />
        <meta
          name="description"
          content="Think you’ve got the best cat meme? 😸 Show us to win a piece from $1000 in $TAILS! 🎁"
        />
        <link rel="shortcut icon" href="/logo/coin.webp" />
      </Head>
      <iframe
        className="w-screen h-screen"
        src="https://zealy.io/cw/tokentails"
      ></iframe>
      <div className="absolute bottom-0 right-0 flex justify-center">
        <a href="/" className="p-3 md:p-8">
          <img
            className="h-12 md:h-24 flex-1 object-contain object-left"
            src="/logo/logo.webp"
            alt="logo"
          />
        </a>
      </div>
    </>
  );
}
