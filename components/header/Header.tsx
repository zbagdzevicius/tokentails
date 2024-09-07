import { useEffect, useState } from "react";
import { Socials } from "../footer/Socials";
import { PixelButton } from "../button/PixelButton";

interface navProps {
  title: string;
  link: string;
  isActive?: boolean;
  onSet?: () => void;
}

const navConsts: navProps[] = [
  {
    title: "Game",
    link: "/#catsslider",
  },
  {
    title: "Token",
    link: "/#tokenomics",
  },
  {
    title: "Team",
    link: "/#contact",
  },
  {
    title: "Contact",
    link: "mailto:info@tokentails.com",
  },
];

export const Header = () => {
  const [activeTitle, setActiveTitle] = useState<string | null>(null);
  const [isNavOpen, setIsNavOpen] = useState(false);

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
            : "bg-[rgba(45, 30, 107, 1)] lg:bg-opacity-50 bg-yellow-300 shadow-lg"
          : "-translate-y-full"
      }`}
    >
      <div
        className={`flex flex-wrap items-center justify-between relative ${
          isTop ? "py-6" : "py-2"
        } px-24 max-lg:px-4 relative`}
      >
        <a href="/" className="flex items-center gap-4 transition">
          <img
            className={isTop ? `h-12 md:h-24` : `h-8 md:h-12`}
            src="/logo/logo.webp"
            alt="logo"
          />
          <div className="text-p3 font-secondary">TOKEN TAILS</div>
        </a>
        <ul className="hidden lg:flex space-x-8 py-4 absolute left-1/2 -translate-x-1/2">
          {navConsts.map((navItem, index) => (
            <li
              key={index}
              className="max-lg:border-b max-lg:py-2 px-3 max-lg:rounded"
            >
              <a
                href={navItem.link}
                className={`text-p3 font-secondary hover:custom-gradient-text ${
                  activeTitle === navItem.title
                    ? "custom-gradient-text font-bold"
                    : ""
                }`}
                onClick={() => handleTitleClick(navItem.title)}
              >
                {navItem.title}
              </a>
            </li>
          ))}
        </ul>
        <div className="flex items-center space-x-2">
          <div onClick={() => setIsNavOpen(!isNavOpen)} className="lg:hidden h-12 w-12 flex items-center justify-center bg-gradient-to-b opacity-50 from-yellow-300 to-red-300 mr-4 rounded-xl">
            {isNavOpen ? (
              <img src="/icons/close.svg" alt="close" width={16} height={16} />
            ) : (
              <img
                src="/icons/burger.svg"
                alt="burger"
                width={16}
                height={16}
              />
            )}
          </div>
          <a href="/feed">
            <PixelButton text="Blog" isBig></PixelButton>
          </a>
        </div>
      </div>
      {isNavOpen && (
        <div className="lg:hidden absolute w-full z-10 bg-gradient-to-b from-yellow-300 via-red-300 to-yellow-300">
          <ul className="pb-4 flex flex-col items-center">
            {navConsts.map((navItem, index) => (
              <li key={index} className="py-2 px-3">
                <a
                  href={navItem.link}
                  onClick={() => {
                    handleTitleClick(navItem.title);
                    setIsNavOpen(false);
                  }}
                >
                  <PixelButton active={activeTitle === navItem.title} text={navItem.title}></PixelButton>
                </a>
              </li>
            ))}
            <Socials />
          </ul>
        </div>
      )}
    </header>
  );
};
