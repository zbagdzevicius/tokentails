import { BlogPreview } from "@/components/landing/BlogPreview";
import { CatsHub } from "@/components/landing/CatsHub";
import { FeedbackSlider } from "@/components/landing/FeedbackSlider";
import { HomePage } from "@/components/landing/HomePage";
import Roadmap from "@/components/landing/Roadmap";
import { Sponsors } from "@/components/landing/Sponsors";
import { Team } from "@/components/landing/Team";
import { Circle } from "@/components/shared/Circle";
import { PixelButton } from "@/components/shared/PixelButton";
import Snowfall from "@/components/shared/Snowfall";
import { bgStyle, cdnFile } from "@/constants/utils";
import { Footer } from "@/layouts/Footer";
import { Header } from "@/layouts/Header";
import dynamic from "next/dynamic";
import Head from "next/head";
import { useEffect, useRef } from "react";

const Preview = dynamic(() => import("@/components/landing/Preview"), {
  ssr: false,
});

export default function Index() {
  const feedbackSliderRef = useRef(null);
  const roadmapRef = useRef(null);
  const contactRef = useRef(null);

  const sections = [feedbackSliderRef, roadmapRef, contactRef];

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
          className="pt-20 md:pt-32 fade-in h-screen relative flex items-center justify-center"
          style={bgStyle("6")}
          id="homepage"
        >
          <Snowfall />
          <HomePage />
          <div className="absolute inset-0 w-full h-full pointer-events-none">
            <Preview />
          </div>

          <div className="absolute z-30 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pt-48 flex flex-col justify-center items-center">
            <a className="relative" href="/game">
              <PixelButton text="PLAY" isBig subtext="GAME" />
            </a>

            <div className="flex gap-8 mt-4">
              <a target="_blank" href="https://apps.apple.com/app/id6745582489">
                <img
                  className="w-10 opacity-75 hover:opacity-100 hover:w-12 transition-all duration-300"
                  src={cdnFile("icons/social/ios.webp")}
                  draggable="false"
                />
              </a>
              <a
                target="_blank"
                href="https://play.google.com/store/apps/details?id=com.tokentails.app"
              >
                <img
                  className="w-10 opacity-75 hover:opacity-100 hover:w-12 transition-all duration-300"
                  src={cdnFile("icons/social/android.webp")}
                  draggable="false"
                />
              </a>
            </div>
          </div>
        </div>
        <div
          className="py-4 min-h-screen flex items-center justify-center"
          style={bgStyle("4")}
        >
          <div id="feedbackslider" ref={feedbackSliderRef}>
            <FeedbackSlider />
          </div>
        </div>
        <div
          className="min-h-screen flex items-center py-3"
          style={bgStyle("3")}
        >
          <div className="w-full py-16" id="blog">
            <CatsHub />
            <BlogPreview />
          </div>
        </div>
        {/* <div className="py-6 flex items-center justify-center bg-gradient-to-r from-blue-300 to-purple-500">
          <GameAggregators />
        </div> */}
        <div
          className="min-h-screen flex items-center justify-center"
          style={bgStyle("4")}
        >
          <div className="h-full" id="roadmap" ref={roadmapRef}>
            <Roadmap />
          </div>
        </div>
        <div
          className="pt-4 min-h-screen flex items-center justify-center relative"
          style={{
            backgroundImage: "url(/backgrounds/bg.svg)",
            backgroundRepeat: "no-repeat",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <Sponsors />
          <div className="h-full mb-16" id="contact" ref={contactRef}>
            <Team />
          </div>
        </div>
        <Footer />
      </div>
    </>
  );
}
