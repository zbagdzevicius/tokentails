
interface MediaCardProps {
    image: string,
    title: string,
    subtitle: string,
    link: string,
}

export const MediaCard = ({ image, title, subtitle, link }: MediaCardProps) => {
    return (
        <div className="bg-[#3C3A57] w-80 md:w-96  flex flex-col gap-10 md:gap-14">
            <img src={image} alt={title} className="w-full h-32 lg:h-40 bg-yellow-500"></img>
            <div className="mx-6 mb-10 flex flex-col gap-10">
                <h2 className="font-bold text-main-white block text-base md:text-xl uppercase">
                    {title}
                </h2>
                <p className="font-medium text-main-white block text-sm md:text-base lg:text-lg">
                    {subtitle}
                </p>
                <a className="font-bold text-base md:text-lg text-white" href={link} target="_blank">READ MORE</a>
            </div>
        </div>
    )
}
