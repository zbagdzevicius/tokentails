import React, { useState } from "react";
import Image from "next/image"

interface FooterProps {
  title: string;
  isActive?: boolean;
  onSet?: () => void;
}

interface SocialProps {
  image: string;
  name: string;
  link: string;
}

const footerConsts: FooterProps[] = [
  {
    title: "Marketplace",
  },
  {
    title: "Stats"
  },
  {
    title: "Colection",
  },
  {
    title: "Explore",
  },
  {
    title: "Comunity",
  },
];

const SocialConsts: SocialProps[] = [
  {
    image: '/icons/social/twitter.svg',
    name: "Twiter",
    link: "https://twitter.com",
  },
  {
    image: '/icons/social/facebook.svg',
    name: "Facebook",
    link: "https://www.facebook.com",
  },
  {
    image: '/icons/social/instagram.svg',
    name: "Instagram",
    link: "https://www.instagram.com",
  },
  {
    image: '/icons/social/github.svg',
    name: "Github",
    link: "https://github.com",
  },
]
export const Footer: React.FC = () => {
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const [activeTitle, setActiveTitle] = useState<string | null>(null);

  const handleTitleClick = (title: string) => {
    setActiveTitle(title === activeTitle ? null : title);
  };

  return (
    <footer className="text-white text-center py-4">
      <div className='flex flex-wrap items-center justify-around max-lg:justify-between mx-2' >
        <Image className=" w-32 h-8 max-lg:w-24 max-lg:h-6" src="/logo/logo.png" alt='logo' width={100} height={50}></Image>
        <ul className='flex max-lg:order-3'>
          {footerConsts.map((footerItem, index) => (
            <li
              key={index}
              className="max-lg:py-6 px-3 max-lg:rounded">
              <a
                className={`text-p5 max-lg:text-p6 cursor-pointer font-primary hover:custom-gradient-text ${activeTitle === footerItem.title ? "custom-gradient-text font-bold" : ""
                  }`}
                onClick={() => handleTitleClick(footerItem.title)}
              >
                {footerItem.title}
              </a>
            </li>
          ))}
        </ul>
        <ul className="flex flex-row space-x-3 max-lg:order-2">
          {SocialConsts.map((socialItem, index) =>
            <a key={index} href={socialItem.link} target="_blank" rel="noopener noreferrer">
              <li className="flex items-center justify-center w-7 h-7 max-lg:w-6 max-lg:h-6 rounded-full bg-main-midnight">
                <Image src={socialItem.image} alt={socialItem.name} className="rounded-full w-4 h-4" width={16} height={16} />
              </li>
            </a>
          )}
        </ul>
      </div >
      <div className="flex justify-center items-center">
        <hr className="h-px my-8 max-lg:my-2 w-11/12 bg-gray-200 border-0 dark:bg-gray-700" />
      </div>
      <p className="text-sm text-main-gray max-lg:text-p7 my-10 ">&copy; {currentYear} All Rights Reserved by Play Games</p>
    </footer >
  );
};
