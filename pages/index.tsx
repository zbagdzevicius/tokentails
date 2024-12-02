import { Airdrop } from "@/components/landing/Airdrop";
import { BlogPreview } from "@/components/landing/BlogPreview";
import { CatsHub } from "@/components/landing/CatsHub";
import { FeedbackSlider } from "@/components/landing/FeedbackSlider";
import { GameModes } from "@/components/landing/GameModes";
import { HomePage } from "@/components/landing/HomePage";
import { Presale } from "@/components/landing/Presale";
import Roadmap from "@/components/landing/Roadmap";
import { Team } from "@/components/landing/Team";
import { Tokenomics } from "@/components/landing/Tokenomics";
import { Circle } from "@/components/shared/Circle";
import Snowfall from "@/components/shared/Snowfall";
import { Footer } from "@/layouts/Footer";
import { Header } from "@/layouts/Header";
import Head from "next/head";
import { useEffect, useRef } from "react";

export default function Index() {
  const catssliderRef = useRef(null);
  const gamessliderRef = useRef(null);
  const catshubRef = useRef(null);
  const catswinnersRef = useRef(null);
  const feedbackSliderRef = useRef(null);
  const tokenomicsRef = useRef(null);
  const roadmapRef = useRef(null);
  const contactRef = useRef(null);

  const sections = [
    catssliderRef,
    gamessliderRef,
    catshubRef,
    catswinnersRef,
    feedbackSliderRef,
    tokenomicsRef,
    roadmapRef,
    contactRef,
  ];

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (
            entry.isIntersecting &&
            !entry.target.classList.contains("animated-block")
          ) {
            entry.target.classList.add("animated-block");
          }
        });
      },
      {
        rootMargin: "100px",
        threshold: 0.35,
      }
    );
    sections.forEach((sectionRef) => {
      if (sectionRef.current) {
        observer.observe(sectionRef.current);
      }
    });

    return () => {
      sections.forEach((sectionRef) => {
        if (sectionRef.current) {
          observer.unobserve(sectionRef.current);
        }
      });
    };
  }, []);
  useEffect(() => {
    sections.forEach((sectionRef) => {
      if (sectionRef.current) {
        (sectionRef.current as HTMLDivElement).classList.add("invisible-block");
      }
    });
  }, [sections]);
  return (
    <>
      <Head>
        <title>Token Tails - Play to Save</title>
        <meta property="og:image" content="/logo/ogg.jpg" />
        <meta
          property="og:title"
          content="Token Tails - Play to Save"
          key="title"
        />
        <meta
          name="description"
          content="PLAY WITH YOUR VIRTUAL CAT TO SAVE A CAT IN A SHELTER"
        />
        <link rel="shortcut icon" href="/logo/coin.webp" />
      </Head>

      <Header />

      <div className="flex flex-col">
        <div className="fixed -left-48 -bottom-32 md:-bottom-64">
          <Circle />
        </div>
        <div className="fixed -right-48 -top-32 md:-top-64">
          <Circle />
        </div>
        <div
          className="pt-24 md:pt-36 fade-in h-screen relative"
          style={{
            backgroundImage: "url(/base/bg-night-2.gif)",
            backgroundRepeat: "no-repeat",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div id="homepage">
            <Snowfall />
            <HomePage />
          </div>
        </div>
        <div
          className="pb-4 pt-3 md:pt-0 min-h-screen"
          style={{
            backgroundImage: "url(/base/bg-4.gif)",
            backgroundRepeat: "no-repeat",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div
            className="z-10 relative h-full"
            id="presale"
            ref={gamessliderRef}
          >
            <Presale />
          </div>
        </div>
        <div
          className="pb-4 pt-3 md:pt-0 min-h-screen flex items-center justify-center w-full"
          style={{
            backgroundImage: "url(/base/bg.gif)",
            backgroundRepeat: "no-repeat",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div className="h-full w-full" id="game" ref={catssliderRef}>
            <GameModes />
          </div>
        </div>

        <div
          className="py-4 min-h-screen"
          style={{
            backgroundImage: "url(/base/bg-3.gif)",
            backgroundRepeat: "no-repeat",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div id="cats" ref={catshubRef}>
            <CatsHub />
          </div>
        </div>
        <div
          className="pb-4 pt-3 md:pt-0 min-h-screen flex items-center justify-center"
          style={{
            backgroundImage: "url(/base/bg-6.png)",
            backgroundRepeat: "no-repeat",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div className="h-full w-full" id="airdrop" ref={catssliderRef}>
            <Airdrop />
          </div>
        </div>
        <div
          className="py-4 min-h-screen flex items-center justify-center"
          style={{
            backgroundImage: "url(/base/bg-2.gif)",
            backgroundRepeat: "no-repeat",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div
            className="relative overflow-hidden"
            id="tokenomics"
            ref={catswinnersRef}
          >
            <Tokenomics />
          </div>
        </div>
        <div
          className="min-h-screen flex items-center justify-center"
          style={{
            backgroundImage: "url(/base/bg-5.png)",
            backgroundRepeat: "no-repeat",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div className="h-full" id="roadmap" ref={roadmapRef}>
            <Roadmap />
          </div>
        </div>
        <div
          className="py-4 h-screen"
          style={{
            backgroundImage: "url(/base/bg-6.png)",
            backgroundRepeat: "no-repeat",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div id="feedbackslider" ref={feedbackSliderRef}>
            <FeedbackSlider />
          </div>
        </div>
        <div
          className="h-screen flex items-center"
          style={{
            backgroundImage: "url(/base/bg-night.gif)",
            backgroundRepeat: "no-repeat",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div className="w-full" id="blog">
            <BlogPreview />
          </div>
        </div>
        <div
          className="pt-4 min-h-screen flex items-center justify-center"
          style={{
            backgroundImage: "url(/base/bg.svg)",
            backgroundRepeat: "no-repeat",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div className="h-full" id="contact" ref={contactRef}>
            <Team />
          </div>
        </div>
        <Footer />
      </div>
    </>
  );
}
