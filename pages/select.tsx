import { useState } from 'react';
import { CatGame } from "@/components/catGame/CatGame";
import { getCatAbility, resqueStory, CatAbilities } from "@/models/cats";
import ModalCard from '@/components/modalCard/ModalCard';

export default function Select() {
    const assignAbilitiesToCats = () => {
        return [
            { id: 1, img: '/catgame/cat.gif', name: "Alpha", ability: getCatAbility(), story: resqueStory("Alpha"), },
            { id: 2, img: '/catgame/cat.gif', name: "Beta", ability: getCatAbility(), story: resqueStory("Beta"), },
            { id: 3, img: '/catgame/cat.gif', name: "Gamma", ability: getCatAbility(), story: resqueStory("Gamma"), },
            { id: 4, img: '/catgame/cat.gif', name: "Delta", ability: getCatAbility(), story: resqueStory("Delta"), },
            { id: 5, img: '/catgame/cat.gif', name: "Epsilon", ability: getCatAbility(), story: resqueStory("Epsilon"), },
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
