import { BlogPreview } from "@/components/landing/BlogPreview";
import { CatsHub } from "@/components/landing/CatsHub";
import { FeedbackSlider } from "@/components/landing/FeedbackSlider";
import { GameAggregators } from "@/components/landing/GameAggregators";
import { GameModes } from "@/components/landing/GameModes";
import { HomePage } from "@/components/landing/HomePage";
import { ProcessExplained } from "@/components/landing/ProcessExplained";
import Roadmap from "@/components/landing/Roadmap";
import { Team } from "@/components/landing/Team";
import { Circle } from "@/components/shared/Circle";
import Snowfall from "@/components/shared/Snowfall";
import { bgStyle, cdnFile } from "@/constants/utils";
import { Footer } from "@/layouts/Footer";
import { Header } from "@/layouts/Header";
import { isApp } from "@/models/app";
import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect, useRef } from "react";

export default function Index() {
  const catssliderRef = useRef(null);
  const gamessliderRef = useRef(null);
  const catshubRef = useRef(null);
  const catswinnersRef = useRef(null);
  const processExplainedRef = useRef(null);
  const feedbackSliderRef = useRef(null);
  const tokenomicsRef = useRef(null);
  const roadmapRef = useRef(null);
  const contactRef = useRef(null);
  const router = useRouter();

  const sections = [
    catssliderRef,
    processExplainedRef,
    gamessliderRef,
    catshubRef,
    catswinnersRef,
    feedbackSliderRef,
    tokenomicsRef,
    roadmapRef,
    contactRef,
  ];

  useEffect(() => {
    if (isApp) {
      router.replace("/game");
    }
  }, []);

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
        <meta property="og:image" content={cdnFile("logo/ogg.jpg")} />
        <meta
          property="og:title"
          content="Token Tails - Play to Save"
          key="title"
        />
        <meta
          name="description"
          content="PLAY WITH YOUR VIRTUAL CAT TO SAVE A CAT IN A SHELTER"
        />
        <link rel="shortcut icon" href={cdnFile("logo/coin.webp")} />
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
          className="pt-20 md:pt-24 fade-in h-screen relative flex items-center justify-center"
          style={bgStyle("6")}
          id="homepage"
        >
          <Snowfall />
          <HomePage />
        </div>
        <div
          className="py-4 min-h-screen flex items-center justify-center"
          style={bgStyle("7")}
        >
          <div id="process-explained" ref={processExplainedRef}>
            <ProcessExplained />
          </div>
        </div>
        <div
          className="py-4 min-h-screen flex items-center justify-center"
          style={bgStyle("5")}
        >
          <div id="feedbackslider" ref={feedbackSliderRef}>
            <FeedbackSlider />
          </div>
        </div>
        <div
          className="pb-4 pt-3 md:pt-0 min-h-screen flex items-center justify-center w-full"
          style={bgStyle("4")}
        >
          <div className="h-full w-full" id="game" ref={catssliderRef}>
            <GameModes />
          </div>
        </div>
        <div className="py-6 flex items-center justify-center bg-gradient-to-r from-blue-300 to-purple-500">
          <GameAggregators />
        </div>
        <div
          className="min-h-screen flex items-center py-3"
          style={bgStyle("3")}
        >
          <div className="w-full" id="blog">
            <CatsHub />
            <BlogPreview />
          </div>
        </div>
        <div
          className="min-h-screen flex items-center justify-center"
          style={bgStyle("4")}
        >
          <div className="h-full" id="roadmap" ref={roadmapRef}>
            <Roadmap />
          </div>
        </div>
        <div
          className="pt-4 min-h-screen flex items-center justify-center"
          style={{
            backgroundImage: "url(/backgrounds/bg.svg)",
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
