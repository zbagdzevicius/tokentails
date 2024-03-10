import Image from "next/image";

export const CatsWinners = () => {
    return (
        <div className="flex items-center justify-center container">
            <div className="w-8/12 max-lg:w-full max-lg:m-5">
                <h1 className="text-left font-secondary uppercase tracking-tighter text-h2 text-balance max-lg:text-h6 my-3">
                    we’re the first gaming award winners the world
                </h1>
                <div className="grid grid-cols-2 max-lg:grid-cols-1 grid-rows-7 gap-6 max-lg:gap-2">
                    <div>
                        <div className="flex flex-row items-center flex-wrap space-x-3 text-p5 max-lg:text-sm font-primary">
                            <p className="text-main-rustyOrange">Adventure</p>
                            <p className="active:text-main-rustyOrange">Arcade</p>
                            <p>Arena</p>
                            <p>Avoider</p>
                            <p>Balance</p>
                        </div>
                    </div>
                    <div className="p-1 max-lg:p-0.5 row-span-10 bg-gradient-to-br from-main-slate via-main-grape to-main-rusty rounded-2xl">
                        <Image className="w-full h-full object-cover rounded-2xl" src="/images/cats-winners/cat-tamogotchi.jpg" width={200} height={200} alt="cats" />
                    </div>
                    <div className="p-1 max-lg:p-0.5  row-span-10 bg-gradient-to-br from-main-slate via-main-grape to-main-rusty rounded-2xl">
                        <Image className="w-full h-full object-cover rounded-2xl" src="/images/cats-winners/cats-customize-1.jpg" width={200} height={200} alt="cats" />
                    </div>
                    <div className="p-1 max-lg:p-0.5  row-span-9 bg-gradient-to-br from-main-slate via-main-grape to-main-rusty rounded-2xl">
                        <Image className="w-full h-full object-cover rounded-2xl" src="/images/cats-winners/cats-group-2.jpg" width={200} height={200} alt="cats" />
                    </div>
                    <div className="p-1 max-lg:p-0.5  row-span-10 bg-gradient-to-br from-main-slate via-main-grape to-main-rusty rounded-2xl">
                        <Image className="w-full h-full object-cover rounded-2xl" src="/images/cats-winners/cats-group-1.jpg" width={200} height={200} alt="cats" />
                    </div>
                    <div className="rows-span-2">
                        <div className="flex flex-row justify-between items-center">
                            <div className="flex flex-col">
                                <p className="text-p4 max-lg:text-p5 font-tertiary">We’ve have many more than</p>
                                <h1 className="text-h2 max-lg:text-h3 font-secondary">100+</h1>
                                <p className="text-p4 max-lg:text-p5  font-tertiary">Gaming <span className="custom-gradient-text font-bold">Collections</span></p>
                            </div>
                            <div>
                                <button className="[clip-path:polygon(0%_0%,100%_0%,92%_100%,0%_100%)]
                    bg-gradient-to-r from-main-ember to-main-rusty rounded w-32 h-10 max-lg:w-24">
                                    <span className="text-center text-lg font-primary max-lg:text-xs leading-4">
                                        View More
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
