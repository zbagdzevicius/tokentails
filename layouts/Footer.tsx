import React, { useState } from "react";
import { Socials } from "./Socials";
import { cdnFile } from "@/constants/utils";
import { PixelButton } from "@/components/shared/PixelButton";

interface FooterProps {
  title: string;
  link: string;
  isActive?: boolean;
  onSet?: () => void;
}

const navConsts: FooterProps[] = [
  {
    title: "Blog",
    link: "/feed",
  },
  {
    title: "CATS",
    link: "/cats",
  },
  {
    title: "REWARDS",
    link: "/airdrop",
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
        <div className="flex flex-wrap items-center container md:justify-around justify-between lg:px-24">
          <div className="flex items-center gap-4">
            <img
              draggable={false}
              className="h-24 flex-1 object-contain object-left"
              src={cdnFile("logo/logo.webp")}
              alt="logo"
            />

            <Socials />
          </div>
          <ul className="flex flex-1 justify-center font-secondary font-bold">
            <ul className="hidden lg:flex">
              {navConsts.map((navItem, index) => (
                <li key={index} className="max-lg:border-b max-lg:rounded">
                  <a
                    href={navItem.link}
                    onClick={() => handleTitleClick(navItem.title)}
                  >
                    <PixelButton text={navItem.title} isSmall />
                  </a>
                </li>
              ))}
            </ul>
          </ul>
          <div className="flex-1 font-secondary text-end whitespace-nowrap flex w-fit gap-2">
            © 2024 All Rights Reserved by Token Tails
            <a
              href="https://docs.tokentails.com/community-and-social-impact/terms-and-conditions"
              target="_blank"
              className="text-blue-700"
            >
              T&C
            </a>{" "}
            <a
              href="https://docs.tokentails.com/community-and-social-impact/privacy-policy"
              target="_blank"
              className="text-blue-700"
            >
              Privacy Policy
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};
