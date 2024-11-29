import { Slider } from "./Slider"
import { MediaCard } from "./MediaCard";
const catReview: {
    image: string,
    title: string,
    subtitle: string,
    link: string,
}[] = [
        {
            image: "/icons/social-logos/ap.svg",
            title: "title",
            subtitle: "Click “Authority”, extract  business insider, AP, Benzinga, Newsmax, StreetInsider, Asiaone LOGOS and put them, you can place random text instead of titles, link can be href=”#” for now",
            link: "I'm full of treats",
        },
        {
            image: "/icons/social-logos/asiaone.svg",
            title: "title",
            subtitle: "Click “Authority”, extract  business insider, AP, Benzinga, Newsmax, StreetInsider, Asiaone LOGOS and put them, you can place random text instead of titles, link can be href=”#” for now",
            link: "I'm full of treats",
        },
        {
            image: "/icons/social-logos/benzinga.svg",
            title: "title",
            subtitle: "Click “Authority”, extract  business insider, AP, Benzinga, Newsmax, StreetInsider, Asiaone LOGOS and put them, you can place random text instead of titles, link can be href=”#” for now",
            link: "I'm full of treats",
        },
        {
            image: "/icons/social-logos/business-insider.svg",
            title: "title",
            subtitle: "Click “Authority”, extract  business insider, AP, Benzinga, Newsmax, StreetInsider, Asiaone LOGOS and put them, you can place random text instead of titles, link can be href=”#” for now",
            link: "I'm full of treats",
        },
        {
            image: "/icons/social-logos/newsmax.svg",
            title: "title",
            subtitle: "Click “Authority”, extract  business insider, AP, Benzinga, Newsmax, StreetInsider, Asiaone LOGOS and put them, you can place random text instead of titles, link can be href=”#” for now",
            link: "I'm full of treats",
        },
        {
            image: "/icons/social-logos/street-insider.svg",
            title: "title",
            subtitle: "Click “Authority”, extract  business insider, AP, Benzinga, Newsmax, StreetInsider, Asiaone LOGOS and put them, you can place random text instead of titles, link can be href=”#” for now",
            link: "I'm full of treats",
        },
    ];

export const AboutUs = () => {
    const items = catReview.map((review) => (
        <MediaCard image={review.image} title={review.title} subtitle={review.subtitle} link={review.link} />
    ));
    return (
        <>
            <div className="flex items-center justify-center flex-col ">
                <h2 className="text-left font-secondary uppercase tracking-tight text-h2 text-balance max-lg:text-h6 my-3">
                    Real Verified Cat reviews
                </h2>
                <Slider isCoverflowDisabled items={items} />
            </div>
        </>
    )
}
