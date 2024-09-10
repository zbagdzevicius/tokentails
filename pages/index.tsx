import { Footer } from "@/components/footer/Footer";
import { Header } from "@/components/header/Header";
import { BlogPreview } from "@/components/landing/BlogPreview";
import { CatsHub } from "@/components/landing/catsHub/CatsHub";
import { CatsSlider } from "@/components/landing/catsSlider/CatsSlider";
import { CatsWinners } from "@/components/landing/catsWinners/CatsWinners";
import Contact from "@/components/landing/contact/Contact";
import { FeedbackSlider } from "@/components/landing/feedbackSlider/FeedbackSlider";
import { GameModesSlider } from "@/components/landing/GameModesSlider";
import { HomePage } from "@/components/landing/homePage/HomePage";
import Roadmap from "@/components/landing/roadmap/Roadmap";
import { Tokenomics } from "@/components/landing/tokenomics/Tokenomics";
import { Circle } from "@/components/shared/Circle";
import { CircleWhite } from "@/components/shared/CircleWhite";
import Head from "next/head";
import { useEffect, useRef, useState } from "react";

export default function Index() {
  const [activeSection, setActiveSection] = useState("");
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
            setActiveSection(entry.target.id);
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
          className="pt-24 md:pt-36 fade-in"
          style={{
            backgroundImage: "url(/base/bg-night.gif)",
            backgroundRepeat: "no-repeat",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div id="homepage">
            <HomePage />
          </div>
        </div>
        <div className="pb-4 pt-3 md:pt-0 bg-gradient-to-b from-purple-300 to-blue-300">
          <div id="catsslider" ref={catssliderRef}>
            <CatsSlider />
          </div>
        </div>
        <div
          className="py-4 bg-gradient-to-b from-purple-300"
          style={{
            backgroundImage: "url(/base/bg-2.gif)",
            backgroundRepeat: "no-repeat",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div id="catshub" ref={catshubRef}>
            <CatsHub />
          </div>
        </div>
        <div className="pb-4 pt-3 md:pt-0 bg-gradient-to-b from-purple-300 to-yellow-300">
          <div id="catsslider" ref={gamessliderRef}>
            <GameModesSlider />
          </div>
        </div>
        <div className="py-4 bg-gradient-to-b from-yellow-300 via-yellow-300 to-purple-300">
          <div
            className="relative overflow-hidden"
            id="catswinners"
            ref={catswinnersRef}
          >
            <div className="z-10 relative">
              <CatsWinners />
            </div>
            <div className="absolute bottom-0 right-0 md:right-72 z-0">
              <CircleWhite />
            </div>
          </div>
        </div>
        <div className="py-4 pt-24 bg-gradient-to-t from-blue-300 to-purple-300">
          <div id="roadmap" ref={roadmapRef}>
            <Roadmap />
          </div>
        </div>
        <div className="py-4 bg-gradient-to-t from-green-300 to-blue-300">
          <div id="feedbackslider" ref={feedbackSliderRef}>
            <FeedbackSlider />
          </div>
        </div>
        <div className="bg-gradient-to-b from-green-300 to-blue-300">
          <div id="blog">
            <BlogPreview />
          </div>
        </div>
        <div className="pt-4 bg-gradient-to-b from-green-300 to-yellow-300">
          <div id="contact" ref={contactRef}>
            <Contact />
          </div>
        </div>
        <Footer />
      </div>
    </>
  );
}
