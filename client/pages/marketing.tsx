import { SeoHead } from "@/components/seo/SeoHead";
import { Header } from "@/layouts/Header";
import React from "react";

export default function marketing() {
  return (
    <>
      <SeoHead
        title="Token Tails - Partnerships"
        description="Do you want to work with us?"
        path="/marketing"
      />

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
