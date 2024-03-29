import Image from "next/image"

interface bannerProps {
    image: string;
    title: string;
}

const sponsorImage = [
    {
        image: "/images/sponsor/twitch.png",
        name: "Twitch",
    },
    {
        image: '/images/sponsor/roblox.png',
        name: "Roblox",
    },
    {
        image: '/images/sponsor/gamesradar.png',
        name: "Gamesradar",
    },
    {
        image: '/images/sponsor/chess.png',
        name: "Chess",
    },
    {
        image: "/images/sponsor/twitch.png",
        name: "Twitch",
    },
    {
        image: '/images/sponsor/roblox.png',
        name: "Roblox",
    },
    {
        image: '/images/sponsor/gamesradar.png',
        name: "Gamesradar",
    },
    {
        image: '/images/sponsor/chess.png',
        name: "Chess",
    },
    {
        image: '/images/sponsor/gamesradar.png',
        name: "Gamesradar",
    },
    {
        image: '/images/sponsor/chess.png',
        name: "Chess",
    },

    {
        image: "/images/sponsor/twitch.png",
        name: "Twitch",
    },
    {
        image: '/images/sponsor/roblox.png',
        name: "Roblox",
    },
    {
        image: '/images/sponsor/gamesradar.png',
        name: "Gamesradar",
    },
    {
        image: '/images/sponsor/chess.png',
        name: "Chess",
    },
    {
        image: "/images/sponsor/twitch.png",
        name: "Twitch",
    },
    {
        image: '/images/sponsor/roblox.png',
        name: "Roblox",
    },
    {
        image: '/images/sponsor/gamesradar.png',
        name: "Gamesradar",
    },
    {
        image: '/images/sponsor/chess.png',
        name: "Chess",
    },
    {
        image: '/images/sponsor/gamesradar.png',
        name: "Gamesradar",
    },
    {
        image: '/images/sponsor/chess.png',
        name: "Chess",
    },
]

const bannerWhiteConsts: bannerProps[] = [
    {
        image: "/logo/logo-black.png",
        title: "Play logo"
    },
]
const bannerBlackConsts: bannerProps[] = [
    {
        image: "/logo/logo.png",
        title: "Play logo"
    },
]
export const HomePage = () => {
    return (
        <div className=" my-4 flex justify-center items-center flex-col">
            <div className=" relative w-6/12 max-lg:w-full pt-16 px-10 max-lg:text-balance">
                <Image className="absolute top-0 left-0 " src="/images/homePage/firework.png" alt="fireworks" width={80} height={80} />
                <h1 className="text-center font-secondary uppercase tracking-tighter text-8xl max-lg:text-4xl">
                    Next Generation Get Your Desierd Rank Now
                </h1>
            </div>
            <div className="relative w-full flex items-center justify-center overflow-hidden">
                <div className=" absolute slider-banner 2xl:rotate-[5deg]  md:rotate-6 rotate-12 bg-main-black max-lg:h-10 z-10">
                    <div className="h-full w-full slide-track absolute">
                        {bannerBlackConsts.map((banner, index) => (
                            <div
                                key={index}
                                className="w-full h-full  bg-center bg-repeat-x "
                                style={{ backgroundImage: `url(${banner.image})` }}
                            ></div>
                        ))}
                    </div>
                </div>
                <div className="absolute slider-banner transform 2xl:-rotate-[5deg]  md:-rotate-6 -rotate-12 bg-main-white max-lg:h-10">
                    <div className=" w-full h-full slide-track absolute">
                        {bannerWhiteConsts.map((banner, index) => (
                            <div
                                key={index}
                                className="w-full h-full bg-center bg-repeat-x"
                                style={{ backgroundImage: `url(${banner.image})`, }}
                            ></div>
                        ))}
                    </div>
                </div>
                <div>
                </div>
                <div className="relative h-fit flex items-center justify-center pb-10 max-lg:pb-7">
                    <div className="relative pt-20 max-lg:pt-10 px-14 max-lg:px-0 flex items-center justify-center">
                        <div className="relative w-full max-lg:w-9/12">
                            <Image
                                src='/images/home-page/cat-background.png'
                                alt="Cats Background"
                                className="w-full h-full"
                                width={500}
                                height={500}
                            />
                            <Image
                                src="/images/home-page/bg-1.jpg"
                                alt="cats"
                                className="absolute inset-0 w-full h-full object-cover z-3 md:p-2.5 p-1.5"
                                width={500}
                                height={500}
                            />
                            <Image
                                src="/images/home-page/cats-top.png"
                                alt="Cat Hero"
                                className="absolute -top-16 lg:-top-36 right-0 w-1/2 object-cover overflow-hidden"
                                width={500}
                                height={500}
                            />
                        </div>
                        <Image src="/images/home-page/crown.png" alt='crown' className="w-16 max-lg:w-10 h-16 max-lg:h-10 absolute top-0 right-0"
                            width={100}
                            height={100} />
                    </div>
                    <div className="absolute bottom-0">
                        <button className="[clip-path:polygon(0%_1%,100%_0%,90%_100%,10%_100%)] w-64 max-lg:w-32 max-sm:w-28 h-12 max-lg:h-8 
                    bg-gradient-to-r from-main-ember to-main-rusty text-2xl max-lg:text-sm font-primary max-sm:text-xs">
                            Register Now
                        </button>
                    </div>
                </div>
            </div>

            <div className=" slider container">
                <div className="slide-track  ">
                    {sponsorImage.map((sponsor, index) => (
                        <div key={index} className="slide">
                            <Image src={sponsor.image} alt={sponsor.name} width={100} height={100} />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
