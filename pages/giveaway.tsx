import Head from "next/head";
import React, { useEffect } from "react";

export default function giveaway() {
  useEffect(() => {
    window.location.href = 'https://taskon.xyz/campaign/detail/13703047' 
  }, [])
  return (
    <>
      <Head>
        <title>Token Tails - Play to Save</title>
        <meta property="og:image" content="/airdrop-2.jpg" />
        <meta property="og:title" content="Token Tails Airdrop" key="title" />
        <meta
          name="description"
          content="$1000 USD, early access, 50+ winners. Join us in an airdrop, to celebrate our project!"
        />
        <link rel="shortcut icon" href="/logo/coin.webp" />
      </Head>
      <iframe
        className="w-screen h-screen"
        src="https://gleam.io/53NWn/tokentails-1st-airdrop-1700-usd-50-winners"
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
