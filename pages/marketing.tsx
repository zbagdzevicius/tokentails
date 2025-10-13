import { cdnFile } from "@/constants/utils";
import { Header } from "@/layouts/Header";
import Head from "next/head";
import React from "react";

export default function marketing() {
  return (
    <>
      <Head>
        <title>Token Tails - Partnerships</title>
        <meta property="og:image" content={cdnFile("logo/ogg.jpg")} />
        <meta
          property="og:title"
          content="Token Tails - Marketing proposal"
          key="title"
        />
        <meta name="description" content="Do you want to work with us ?" />
        <link rel="shortcut icon" href={cdnFile("logo/logo.webp")} />
      </Head>

      <Header />
      <div className="flex justify-center pt-36 pb-12">
        <iframe
          src="https://docs.google.com/forms/d/e/1FAIpQLScG3IUOapes0qDPBcCxg2eeXTiqsF7BAKmjp1R0SkIWhhRlTw/viewform?embedded=true"
          width="640"
          height="1600"
          className="b-0"
        >
          Loading…
        </iframe>
      </div>
    </>
  );
}
