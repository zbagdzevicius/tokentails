import Image from "next/image";
import { useEffect, useState } from "react";

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
    title: "Blog",
    link: "/feed",
  },
  {
    title: "Contact",
    link: "/#contact",
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
            : "bg-[rgba(45, 30, 107, 1)] bg-opacity-50 backdrop-blur-md shadow-lg"
          : "-translate-y-full"
      }`}
    >
      <div className={`flex flex-wrap items-center justify-between ${isTop ? 'py-6' : 'py-2'} px-24 max-lg:px-4 relative`}>
        <a href="/" className="flex items-center gap-4 transition">
          <img className={isTop ? `h-12 md:h-24` : `h-8 md:h-12`} src="/logo/logo.png" alt="logo" />
          <div className="text-p3 font-secondary">TOKEN TAILS</div>
        </a>
        <ul className="lg:!flex lg:space-x-4 max-lg:space-y-2 max-lg:hidden max-lg:py-4 max-lg:w-full">
          {navConsts.map((navItem, index) => (
            <li
              key={index}
              className="max-lg:border-b max-lg:py-2 px-3 max-lg:rounded"
            >
              <a
                href={navItem.link}
                className={`text-p5 max-lg:text-p6 hover:custom-gradient-text ${
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
          <div onClick={() => setIsNavOpen(!isNavOpen)} className="lg:hidden">
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
          <a href="/#preregistration">
            <button
              className="[clip-path:polygon(0%_0%,100%_0%,92%_100%,0%_100%)]
                    bg-gradient-to-r from-main-ember to-main-rusty rounded w-36 h-10 max-lg:w-24 max-lg:h-8"
            >
              <span className="text-center text-lg max-lg:text-xs leading-4 text-white">
                Sign-Up
              </span>
            </button>
          </a>
        </div>
      </div>
      {isNavOpen && (
        <div className="lg:hidden absolute w-full z-10 bg-gradient-to-b from-yellow-300 to-purple-300">
          <ul className="space-y-2">
            {navConsts.map((navItem, index) => (
              <li key={index} className="py-2 px-3">
                <a
                  href={navItem.link}
                  className={`text-p5 hover:custom-gradient-text${
                    activeTitle === navItem.title
                      ? "custom-gradient-text font-bold"
                      : ""
                  }`}
                  onClick={() => {
                    handleTitleClick(navItem.title);
                    setIsNavOpen(false);
                  }}
                >
                  {navItem.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </header>
  );
};
