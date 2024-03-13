import { Slider } from '../../shared/Slider';

import Image from 'next/image';

export const FeedbackSlider = () => {
    const items = [
        < div key={1} className="flex items-center justify-center" >
            <div className="p-0.5 w-full bg-gradient-to-br from-main-slate via-main-grape to-main-rusty max-lg:mx-4">
                <div className="relative flex items-center justify-center flex-col w-full h-fit p-10 max-lg:p-3 bg-gradient-to-r from-[#243031] from-5% via-[#1B2428] via-40% to-[#0D1013] to-90%">
                    <Image className="absolute top-[-35px] right-10" src="/icons/ditto.svg" width={70} height={70} alt="Ditto Mark" />
                    <div className='flex flex-row mb-5'>
                        <Image className="w-8 h-8 max-lg:w-5 max-lg:h-5" src="/icons/star.svg" width={25} height={25} alt="star" />
                        <Image className="w-8 h-8 max-lg:w-5 max-lg:h-5" src="/icons/star.svg" width={25} height={25} alt="star" />
                        <Image className="w-8 h-8 max-lg:w-5 max-lg:h-5" src="/icons/star.svg" width={25} height={25} alt="star" />
                        <Image className="w-8 h-8 max-lg:w-5 max-lg:h-5" src="/icons/star.svg" width={25} height={25} alt="star" />
                        <Image className="w-8 h-8 max-lg:w-5 max-lg:h-5" src="/icons/star.svg" width={25} height={25} alt="star" />

                    </div>
                    <div className='text-center text-p5 font-tertiary text-pretty'>
                        <p>Purr meow meow purr</p>
                        <br />
                        <p>Much purr so meow</p>
                    </div>
                    <div className='flex items-center flex-col'>
                        <img className="w-32" src="/cats/black/Sitting-Hat-Black.gif" alt='avatar' />
                        <p className='text-p4 max-lg:text-p5 font-tertiary '>Peanut</p>
                    </div>
                </div>
            </div>
        </div>, < div key={2} className="flex items-center justify-center" >
            <div className="p-0.5 w-full bg-gradient-to-br from-main-slate via-main-grape to-main-rusty max-lg:mx-4">
                <div className="relative flex items-center justify-center flex-col w-full h-fit p-10 max-lg:p-3 bg-gradient-to-r from-[#243031] from-5% via-[#1B2428] via-40% to-[#0D1013] to-90%">
                    <Image className="absolute top-[-35px] right-10" src="/icons/ditto.svg" width={70} height={70} alt="Ditto Mark" />
                    <div className='flex flex-row mb-5'>
                        <Image className="w-8 h-8 max-lg:w-5 max-lg:h-5" src="/icons/star.svg" width={25} height={25} alt="star" />
                        <Image className="w-8 h-8 max-lg:w-5 max-lg:h-5" src="/icons/star.svg" width={25} height={25} alt="star" />
                        <Image className="w-8 h-8 max-lg:w-5 max-lg:h-5" src="/icons/star.svg" width={25} height={25} alt="star" />
                        <Image className="w-8 h-8 max-lg:w-5 max-lg:h-5" src="/icons/star.svg" width={25} height={25} alt="star" />
                        <Image className="w-8 h-8 max-lg:w-5 max-lg:h-5" src="/icons/star.svg" width={25} height={25} alt="star" />

                    </div>
                    <div className='text-center text-p5 font-tertiary text-pretty'>
                        <div className='text-center text-p5 font-tertiary text-pretty'>
                            <p>I meow you</p>
                            <br />
                            <p>Purrfect place for my meow meow</p>
                        </div>
                    </div>
                    <div className='flex items-center flex-col'>
                        <img className="w-32" src="/cats/pinkie/pink-lamiendo-ropa.gif" alt='avatar' />
                        <p className='text-p4 max-lg:text-p5 font-tertiary '>Pinkie</p>
                    </div>
                </div>
            </div>
        </div>,
        < div key={3} className="flex items-center justify-center" >
            <div className="p-0.5 w-full bg-gradient-to-br from-main-slate via-main-grape to-main-rusty max-lg:mx-4">
                <div className="relative flex items-center justify-center flex-col w-full h-fit p-10 max-lg:p-3 bg-gradient-to-r from-[#243031] from-5% via-[#1B2428] via-40% to-[#0D1013] to-90%">
                    <Image className="absolute top-[-35px] right-10" src="/icons/ditto.svg" width={70} height={70} alt="Ditto Mark" />
                    <div className='flex flex-row mb-5'>
                        <Image className="w-8 h-8 max-lg:w-5 max-lg:h-5" src="/icons/star.svg" width={25} height={25} alt="star" />
                        <Image className="w-8 h-8 max-lg:w-5 max-lg:h-5" src="/icons/star.svg" width={25} height={25} alt="star" />
                        <Image className="w-8 h-8 max-lg:w-5 max-lg:h-5" src="/icons/star.svg" width={25} height={25} alt="star" />
                        <Image className="w-8 h-8 max-lg:w-5 max-lg:h-5" src="/icons/star.svg" width={25} height={25} alt="star" />
                        <Image className="w-8 h-8 max-lg:w-5 max-lg:h-5" src="/icons/star.svg" width={25} height={25} alt="star" />

                    </div>
                    <div className='text-center text-p5 font-tertiary text-pretty'>
                        <p>Meooow meow</p>
                        <br />
                        <p>The best meow in the world</p>
                    </div>
                    <div className='flex items-center flex-col'>
                        <img className="w-32" src="/cats/grey/Loaf-Clothed-Grey.gif" alt='avatar' />
                        <p className='text-p4 max-lg:text-p5 font-tertiary '>Snowball</p>
                    </div>
                </div>
            </div>
        </div>,
    ];
    return (
        <>
            <div className='flex items-center justify-center flex-col my-32 container'>
                <img src="/logo/coin.png" width={100} height={100} alt='coin' />
                <h1 className="text-left font-secondary uppercase tracking-tighter text-h2 text-balance max-lg:text-h6 my-3">
                    Happy cats
                </h1>
                <Slider items={items} />
            </div>
        </>
    )
};
