import { Header } from "@/components/header/Header";
import { HomePage } from "@/components/landing/homePage/HomePage";
import { CatsSlider } from "@/components/landing/catsSlider/CatsSlider";
import { CatsHub } from "@/components/landing/catsHub/CatsHub";
import { CatsWinners } from "@/components/landing/catsWinners/CatsWinners";
import { FeedbackSlider } from "@/components/landing/feedbackSlider/FeedbackSlider";
import { Footer } from "@/components/footer/Footer";
import { useRef, useEffect, useState } from "react";
import Head from "next/head";
import { Tokenomics } from "@/components/landing/tokenomics/Tokenomics";
import Roadmap from "@/components/landing/roadmap/Roadmap";
import Preregistration from "@/components/landing/preregistration/Preregistration";
import Contact from "@/components/landing/contact/Contact";

export default function Index() {
  const [activeSection, setActiveSection] = useState("");
  const homepageRef = useRef(null);
  const catssliderRef = useRef(null);
  const catshubRef = useRef(null);
  const catswinnersRef = useRef(null);
  const feedbackSliderRef = useRef(null);
  const tokenomicsRef = useRef(null);
  const roadmapRef = useRef(null);
  const contactRef = useRef(null);

  const sections = [
    homepageRef,
    catssliderRef,
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
            if (entry.target.id === "homepage") {
              entry.target.classList.add("fade-in");
            }
          }
        });
      },
      {
        rootMargin: "0px",
        threshold: 0.5,
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
        <meta property="og:image" content="/logo/logo.png" />
        <meta
          property="og:title"
          content="Token Tails - Play to Save"
          key="title"
        />
        <meta
          name="description"
          content="PLAY WITH YOUR VIRTUAL CAT TO SAVE A CAT IN A SHELTER"
        />
        <link rel="shortcut icon" href="/logo/coin.png" />
      </Head>

      <Header />

      <div className="flex flex-col gap-8 md:gap-16">
        <div id="homepage" ref={homepageRef}>
          <HomePage />
        </div>
        <div id="catsslider" ref={catssliderRef}>
          <CatsSlider />
        </div>
        <div id="catshub" ref={catshubRef}>
          <CatsHub />
        </div>
        <div id="tokenomics" ref={feedbackSliderRef}>
          <Tokenomics />
        </div>
        <div id="catswinners" ref={catswinnersRef}>
          <CatsWinners />
        </div>
        <div id="roadmap" ref={roadmapRef}>
          <Roadmap />
        </div>
        <div id="feedbackslider" ref={feedbackSliderRef}>
          <FeedbackSlider />
        </div>
        <div id="contact" ref={contactRef}>
          <Contact />
        </div>
        <Footer />
      </div>
    </>
  );
}
