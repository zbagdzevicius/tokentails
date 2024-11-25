import { Window } from "./Window";
import { PixelButtonTiny } from "./PixelButtonTiny";
import { useState } from "react";
import { CatCard } from "../CatCard";
import { useQuery } from "@tanstack/react-query";
import { useProfile } from "@/context/ProfileContext";
import { catsFetch } from "@/constants/api";
import { CloseButton } from "./CloseButton";

interface AdventDay {
    image?: string;
    unlocked: boolean;
    isOpened: boolean;
    cat?: any;
}
interface IAdventCalendar {
    close: () => void
}
const dataCat = {
    ability: "AQUAWHISKER",
    cardImg:
        "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/cards/LOVETAP/cleocatra.png",
    catImg:
        "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/PINKIE/hearted-red/JUMPING.gif",
    catpoints: 7,
    collectionType: "LOVETAP",
    createdAt: "2024-09-11T14:00:51.355Z",
    expiresAt: null,
    isBlueprint: true,
    name: "Cleocatra",
    origin: "PINKIE",
    price: 69,
    resqueStory:
        "A charming cat’s tail swishes create rainbows that make everyone smile, even on the rainiest of days.",
    spriteImg:
        "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/PINKIE/hearted-red.png",
    status: { EAT: 0 },
    tier: "MYTHICAL",
    type: "WATER",
    updatedAt: "2024-11-22T01:00:00.003Z",
    __v: 0,
    _id: "66e1a2931aaa57204c7863cc",
};

export const adventData: Record<number, AdventDay> = {
    1: { image: 'advent-calendar/angel.png', unlocked: false, isOpened: false, cat: dataCat },
    2: { image: 'advent-calendar/beard.png', unlocked: false, isOpened: false, cat: dataCat },
    3: { image: 'advent-calendar/bulps.png', unlocked: false, isOpened: false },
    4: { image: 'advent-calendar/wreath.png', unlocked: false, isOpened: false },
    5: { image: 'advent-calendar/candle.png', unlocked: false, isOpened: false },
    6: { image: 'advent-calendar/christmas-bell.png', unlocked: false, isOpened: false },
    7: { image: 'advent-calendar/christmas-sock.png', unlocked: false, isOpened: false },
    8: { image: 'advent-calendar/christmas-tree.png', unlocked: false, isOpened: false },
    9: { image: 'advent-calendar/cocoa.png', unlocked: false, isOpened: false },
    10: { image: 'advent-calendar/elf-hat.png', unlocked: false, isOpened: false },
    11: { image: 'advent-calendar/gift.png', unlocked: false, isOpened: false },
    12: { image: 'advent-calendar/ginger-bread.png', unlocked: false, isOpened: false },
    13: { image: 'advent-calendar/hat-jigle.png', unlocked: false, isOpened: false },
    14: { image: 'advent-calendar/hat-snowbubble.png', unlocked: false, isOpened: false },
    15: { image: 'advent-calendar/hat-star.png', unlocked: false, isOpened: false },
    16: { image: 'advent-calendar/winter-hat.png', unlocked: false, isOpened: false },
    17: { image: 'advent-calendar/nutcracker.png', unlocked: false, isOpened: false },
    18: { image: 'advent-calendar/polar-bear.png', unlocked: false, isOpened: false },
    19: { image: 'advent-calendar/rudolf.png', unlocked: false, isOpened: false },
    20: { image: 'advent-calendar/santa-green.png', unlocked: false, isOpened: false },
    21: { image: 'advent-calendar/santa-hat.png', unlocked: false, isOpened: false },
    22: { image: 'advent-calendar/santa-red.png', unlocked: false, isOpened: false },
    23: { image: 'advent-calendar/snowman.png', unlocked: false, isOpened: false },
    24: { image: 'advent-calendar/santa.png', unlocked: false, isOpened: false },
    25: { image: 'advent-calendar/jesus.png', unlocked: false, isOpened: false },
};

const daysBackgrounds: Record<number, string> = {
    1: "advent-calendar/background/1.webp",
    2: "advent-calendar/background/2.webp",
    3: "advent-calendar/background/3.webp",
    4: "advent-calendar/background/4.webp",
    5: "advent-calendar/background/5.webp",
    6: "advent-calendar/background/6.webp",
    7: "advent-calendar/background/7-2.webp",
    8: "advent-calendar/background/8.webp",
    9: "advent-calendar/background/9.webp",
    10: "advent-calendar/background/10.webp",
    11: "advent-calendar/background/11.webp",
    12: "advent-calendar/background/12.webp",
    13: "advent-calendar/background/13.webp",
    14: "advent-calendar/background/14.webp",
    15: "advent-calendar/background/15.webp",
    16: "advent-calendar/background/16.webp",
    17: "advent-calendar/background/17.webp",
    18: "advent-calendar/background/18.webp",
    19: "advent-calendar/background/19.webp",
    20: "advent-calendar/background/20.webp",
    21: "advent-calendar/background/21.webp",
    22: "advent-calendar/background/22.webp",
    23: "advent-calendar/background/23.webp",
    24: "advent-calendar/background/24.webp",
    25: "advent-calendar/background/25.webp",
};


export const AdventCalendar = ({ close }: IAdventCalendar) => {
    const [calendarData, setCalendarData] = useState(adventData);
    const [selectedCat, setSelectedCat] = useState<any | null>(null);
    const { profile, setProfileUpdate } = useProfile();
    const { data: cats } = useQuery({
        queryKey: ["cats", profile?.cat],
        queryFn: () => catsFetch(),
    });
    const currentDay = new Date().getDate()
    const backgroundUrl = daysBackgrounds[currentDay] || daysBackgrounds[1]
    const unlockDays = () => {
        Object.entries(adventData).forEach(([day, content]) => {
            if (parseInt(day) <= currentDay) {
                content.unlocked = true;
            }
        });
    };

    const handleOpenDay = (day: number) => {
        setCalendarData((prevData) => {
            const updatedData = { ...prevData };

            if (updatedData[day].unlocked && !updatedData[day].isOpened) {
                updatedData[day] = { ...updatedData[day], isOpened: true };
            }
            return updatedData;
        });
    };

    const handleOpenModal = (day: number) => {
        const cat = calendarData[day]?.cat;
        if (cat) {
            setSelectedCat(cat);
        }
    };

    const handleCloseModal = () => {
        setSelectedCat(null);
    };


    unlockDays();
    return (
        <div className="lg:px-5 px-2 lg:py-20 py-10 " style={{
            backgroundImage: `url(${backgroundUrl})`,
            backgroundPosition: 'center',
            backgroundSize: 'cover',
            backgroundRepeat: 'no-repeat'
        }} onClick={() => close()} >
            <div className="flex flex-wrap lg:gap-24 gap-2 justify-between">
                {Object.entries(calendarData).map(([day, content]) => {
                    const dayNumber = parseInt(day);
                    const isAdopted = content.cat && cats?.find((cat) => cat.name === content.cat.name);
                    return (
                        <Window
                            key={day}
                            isOpened={content.isOpened}
                            isUnlocked={content.unlocked}
                        >
                            <div className="relative w-full h-full " onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-center">
                                    <img
                                        src="advent-calendar/calendar-note.png"
                                        alt={`Day ${dayNumber}`}
                                    />
                                    <h2 className="absolute lg:text-h6 text-md uppercase font-quanternary text-yellow-200 font-bold w-full text-center top-[33%] left-1/2 transform -translate-x-1/2 -translate-y-1/2 lg:text-outline-medium text-outline">
                                        {dayNumber >= 25 ? "Christmas" : `${Math.min(dayNumber, 25)} DAY`}
                                    </h2>
                                    <img className="absolute lg:bottom-14 bottom-7 lg:w-12 w-6 lg:h-12 h-6 " src={content.isOpened ? content.cat.catImg : content.image} />
                                </div>

                                <div className="absolute bottom-0 ">
                                    <PixelButtonTiny
                                        text={
                                            content.isOpened
                                                ? isAdopted
                                                    ? "ADOPTED"
                                                    : "ADOPT"
                                                : "OPEN"
                                        }
                                        onClick={() =>
                                            content.isOpened
                                                ? handleOpenModal(dayNumber)
                                                : handleOpenDay(dayNumber)
                                        }
                                        active={content.isOpened && isAdopted}
                                    />
                                </div>
                            </div>
                        </Window>
                    );
                })}
            </div>
            {selectedCat && (
                <div onClick={(e) => e.stopPropagation()}>
                    <CatCard onClose={handleCloseModal} {...selectedCat} />
                </div>
            )}
            <CloseButton onClick={() => close()} />
        </div>
    );
};
