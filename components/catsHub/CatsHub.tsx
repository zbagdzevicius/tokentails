import React, { useState } from "react";
import Image from "next/image";

interface IProps {
    title: string;
    description: string;
    isActive?: boolean;
    onSet?: () => void;
}

const CatsHubProps: IProps[] = [
    {
        title: "STAFF PICKS WITH ERIN THIS WEEK'S TOP PICKS",
        description:
            "We offer initial courses for free. Advanced courses needs to be bought as NFT. Users can also opt to receive certificates upon completing learning paths, which are issued for a fee as NFTs.",
    },
    {
        title: "Compelling Games Is 20 Years of age!",
        description:
            "Our platform continually updates its courses to reflect the latest trends and developments, ensuring that learners always have access to current and relevant information.",
    },
    {
        title: "Irresistible Games Merchandise Is Here",
        description:
            "By integrating RPG learnplay. Enroll into courses quests, participate in mini-games with your Roadmap character, fight in quizes with your own HP that will be refreshed each day, unlock new courses, play Crypto Wars and accomplish your goals !",
    },
];

const CatsSection = ({ title, description, isActive, onSet }: IProps) => {
    return (
        <div>
            <div className={`
            ${isActive
                    ? " bg-gradient-to-br from-main-slate via-main-grape to-main-rusty p-0.5 w-full rounded"
                    : ""
                }`}
            >
                <button
                    onClick={() => onSet?.()}

                    className={`flex relative z-10 w-full title items-center py-5 px-5 transition 
                ${isActive
                            ? "bg-gradient-to-r from-[#243031] from-5% via-[#1B2428] via-40% to-[#0D1013] to-70%"
                            : ""
                        }`}
                >
                    <Image
                        className={`h-8 max-lg:h-4 max-lg:w-4 w-8 shrink-0 fill-accent-100 transition ase-in-out duration-700 ${isActive ? "rotate-[-180deg]" : ""
                            }`}
                        src="/icons/arrowdown.svg"
                        alt="arrow down"
                        width={60}
                        height={60}
                    />

                    <div className="text-p4 max-lg:text-p5 font-tertiary pl-4">{title}</div>
                </button>
            </div>
            <div
                className={`text-p4 max-lg:text-p5 font-tertiary transition relative z-0 py-4 px-5 border-b ${isActive ? "" : "hidden"
                    }`}
            >
                {description}
            </div>
        </div>
    );
};
export const CatsHub = () => {
    const [active, setActive] = useState(CatsHubProps[0]);
    return (
        <div className="my-20 flex items-center justify-center flex-col container">
            <Image src='/images/cats-hub/crown.png' width={100} height={100} alt="crown" />
            <div className="w-9/12 max-lg:w-full ">
                <h1 className="text-center font-secondary uppercase tracking-tighter text-8xl max-lg:text-5xl  max-lg:text-balance ">
                    THE Most recent Patterns, Conveyed Directly TO YOUR INBOX.
                </h1>

                <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1 max-lg:mx-5 my-10">
                    <div className="relative w-full h-fit">
                        <Image
                            src='/images/cats-hub/cat-background.png'
                            alt="Cats Background"
                            className="w-full h-full"
                            width={500}
                            height={200}
                        />
                        <Image
                            src='/images/cats-hub/cats-customize-2.jpg'
                            alt="cats"
                            className="absolute inset-0 w-full h-full object-cover z-3 md:p-2.5 p-1.5"
                            width={1000}
                            height={1000}
                        />
                    </div>
                    <div>
                        <div className="flex-1">
                            {CatsHubProps.map((section, index) => (
                                <CatsSection
                                    key={index}
                                    title={section.title}
                                    description={section.description}
                                    isActive={section.title === active.title}
                                    onSet={() => setActive(section)}
                                />
                            ))}
                        </div>
                        <div className="flex mt-10 max-lg:mt-5">
                            <button
                                className="[clip-path:polygon(0%_0%,100%_0%,92%_100%,0%_100%)]
                    bg-gradient-to-r from-main-ember to-main-rusty rounded w-32 h-10 max-lg:w-20">
                                <span className="text-center text-base font-primary max-lg:text-xs leading-4">
                                    Play Now
                                </span>
                            </button>
                            <div className="[clip-path:polygon(8%_0%,100%_0%,100%_100%,0%_100%)] flex items-center justify-center bg-gradient-to-r from-main-ember to-main-rusty rounded w-32 h-10 max-lg:w-24 max-lg:h">
                                <button className="[clip-path:polygon(8%_0%,100%_0%,100%_100%,0%_100%)] bg-[#02020a] rounded w-[125px] h-[38px] max-lg:w-[94px]">
                                    <span className="text-center text-base font-primary max-lg:text-xs">
                                        Watch Trailer
                                    </span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
