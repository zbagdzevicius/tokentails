import { cdnFile } from "@/constants/utils";
import { useEffect, useState } from "react";
import { Socials } from "./Socials";

export const Header = () => {
  const [activeTitle, setActiveTitle] = useState<string | null>(null);

  // pop-up header on scroll up and hide on scroll down
  const [showHeader, setShowHeader] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [isTop, setIsTop] = useState(true);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      setIsTop(currentScrollY === 0);

      if (currentScrollY < lastScrollY && currentScrollY > 50) {
        setShowHeader(true);
      } else if (currentScrollY > lastScrollY && currentScrollY > 150) {
        setShowHeader(false);
      }

      setLastScrollY(currentScrollY);
    };

    window.addEventListener("scroll", handleScroll);

    handleScroll();

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, [lastScrollY]);

  const handleTitleClick = (title: string) => {
    setActiveTitle(title === activeTitle ? null : title);
  };
  return (
    <header
      className={`uppercase font-normal transition-animation fixed top-0 left-0 right-0 z-50 transition duration-300 ease-in-out ${
        showHeader
          ? isTop
            ? ""
            : "bg-[rgba(45, 30, 107, 1)] bg-opacity-50 bg-blue-300 shadow-lg"
          : "-translate-y-full"
      }`}
    >
      <div
        className={`flex flex-wrap items-center justify-between relative ${
          isTop ? "py-6" : "py-2"
        } px-24 max-lg:px-4 relative`}
      >
        <a
          href="/"
          className="flex items-center transition gap-2 lg:-ml-24 xl:ml-0"
        >
          <img
            draggable={false}
            className={`${isTop ? `h-12 md:h-20` : `h-8 md:h-12`}`}
            src={cdnFile("logo/logo.webp")}
            alt="logo"
          />
          <div className="text-h3 font-primary hidden md:block">
            TOKEN TAILS
          </div>
        </a>
        <Socials />
      </div>
    </header>
  );
};
