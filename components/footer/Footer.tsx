import React, { useState } from "react";
import { Socials } from "./Socials";

interface FooterProps {
  title: string;
  link: string;
  isActive?: boolean;
  onSet?: () => void;
}

const navConsts: FooterProps[] = [
  {
    title: "Game",
    link: "/#catshub",
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

export const Footer: React.FC = () => {
  const [activeTitle, setActiveTitle] = useState<string | null>(null);

  const handleTitleClick = (title: string) => {
    setActiveTitle(title === activeTitle ? null : title);
  };

  return (
    <div className="z-10">
      <div className="flex justify-center items-center">
        <hr className="h-px w-full bg-gray-200 border-0" />
      </div>
      <footer className="text-center py-4 bg-yellow-300">
        <div className="flex flex-wrap items-center container justify-around max-lg:justify-between lg:px-24">
          <div className="flex items-center gap-4">
            <img
              className="h-24 flex-1 object-contain object-left"
              src="/logo/logo.png"
              alt="logo"
            />

<Socials/>
          </div>
          <ul className="flex flex-1 max-lg:order-3 justify-center">
            {navConsts.map((footerItem, index) => (
              <li key={index} className="max-lg:py-6 px-3 max-lg:rounded">
                <a
                  href={footerItem.link}
                  className={`text-p5 max-lg:text-p6 cursor-pointer hover:custom-gradient-text ${
                    activeTitle === footerItem.title
                      ? "custom-gradient-text font-bold"
                      : ""
                  }`}
                  onClick={() => handleTitleClick(footerItem.title)}
                >
                  {footerItem.title}
                </a>
              </li>
            ))}
          </ul>
          <div className="flex-1 font-secondary text-end whitespace-nowrap">
            © 2024 All Rights Reserved by Token Tails
          </div>
        </div>
      </footer>
    </div>
  );
};
