import Image from "next/image";
import { useState } from "react";

interface navProps {
  title: string;
  link: string;
  isActive?: boolean;
  onSet?: () => void;
}

const navConsts: navProps[] = [
  {
    title: "Activities",
    link: "#catsslider",
  },
  {
    title: "Game",
    link: "#catshub",
  },
  {
    title: "Tokenomics",
    link: "#tokenomics",
  },
  {
    title: "Contact",
    link: "#contact",
  },
];

export const Header = () => {
  const [activeTitle, setActiveTitle] = useState<string | null>(null);
  const [isNavOpen, setIsNavOpen] = useState(false);

  const handleTitleClick = (title: string) => {
    setActiveTitle(title === activeTitle ? null : title);
  };
  return (
    <header>
      <div className="flex flex-wrap items-center justify-between py-6 px-24 max-lg:px-4 relative">
        <div className="flex items-center gap-4">
          <img className="h-12 md:h-24" src="/logo/logo.png" alt="logo" />
          <div className="text-p3 font-secondary">TOKEN TAILS</div>
        </div>
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
              <img
                src="/icons/close.svg"
                alt="close"
                width={16}
                height={16}
              />
            ) : (
              <img
                src="/icons/burger.svg"
                alt="burger"
                width={16}
                height={16}
              />
            )}
          </div>
          <a href="#preregistration">
            <button
              className="[clip-path:polygon(0%_0%,100%_0%,92%_100%,0%_100%)]
                    bg-gradient-to-r from-main-ember to-main-rusty rounded w-36 h-10 max-lg:w-24 max-lg:h-8"
            >
              <span className="text-center text-lg max-lg:text-xs leading-4">
                Pre-Register
              </span>
            </button>
          </a>
        </div>
      </div>
      {isNavOpen && (
        <div className="lg:hidden absolute bg-main-background w-full z-10">
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
