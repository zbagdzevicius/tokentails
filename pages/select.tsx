import { CatGame } from "@/components/catGame/CatGame";
import ModalCard from '@/components/modalCard/ModalCard';
import { CatAbilitySkill, resqueStory } from "@/models/cats";
import { useState } from 'react';

export default function Select() {
    const assignAbilitiesToCats = () => {
        return [
          {
            id: 1,
            img: "/catgame/cat.gif",
            name: "Peanut",
            ability: CatAbilitySkill.WHISKERFLAME,
            story: resqueStory("Peanut"),
          },
          {
            id: 2,
            img: "/cats/grey/Running-Clothed-Grey.gif",
            name: "Snowball",
            ability: CatAbilitySkill.PURRSTORM,
            story: resqueStory("Snowball"),
          },
          {
            id: 3,
            img: "/cats/pinkie/pink-corriendo-ropa.gif",
            name: "Pinkie",
            ability: CatAbilitySkill.FURSHADOW,
            story: resqueStory("Pinkie"),
          },
          {
            id: 4,
            img: "/cats/siamese/siames saltando .gif",
            name: "Cookie",
            ability: CatAbilitySkill.SHADOWPOUNCE,
            story: resqueStory("Cookie"),
          },
          {
            id: 5,
            img: "/cats/yellow/Jump-Hat-Yellow.gif",
            name: "Pickle",
            ability: CatAbilitySkill.AQUAWHISKER,
            story: resqueStory("Pickle"),
          },
          {
            id: 6,
            img: "/cats/grey/digging.gif",
            name: "Rainbow",
            ability: CatAbilitySkill.TAILWIND,
            story: resqueStory("Rainbow"),
          },
          {
            id: 7,
            img: "/cats/black/dig.gif",
            name: "Bagel",
            ability: CatAbilitySkill.TAILWIND,
            story: resqueStory("Bagel"),
          },
        ];
    };

    const CatConsts = assignAbilitiesToCats();
    const [selectedCat, setSelectedCat] = useState<any>(null);

    const handleCatClick = (cat: { id: number, img: string, ability: string }) => {
        setSelectedCat(cat);

    };

    const handleCloseModal = () => {
        setSelectedCat(null);
    };

    return (
        <>
            <CatGame catConsts={CatConsts} onClickCallback={handleCatClick} />
            {selectedCat && (
                <ModalCard
                    onClose={handleCloseModal}
                    img={selectedCat.img}
                    name={selectedCat.name}
                    ability={selectedCat.ability}
                    resqueStory={selectedCat.story}
                    catHp={100}
                />
            )}
        </>
    );
}
