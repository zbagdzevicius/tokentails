'use client'
import React, { useEffect, useState } from "react";
import Image from "next/image";

interface Element {
    id: number;
    axisX: number;
    axisY: number;
    speedX: number;
    speedY: number;
    isMoving?: boolean;
    clicked: boolean;
    img: string;
}

interface CatConst {
    img: string;
    id: number;
    ability: string;
}

interface CatGameProps {
    catConsts: CatConst[];
    onClickCallback: (cat: CatConst) => void;
}

export const CatGame: React.FC<CatGameProps> = ({ catConsts, onClickCallback }) => {
    const generateRandomPosition = (img: string, id: number): Element => ({
        id: id,
        axisX: Math.random() * 2 - 1,
        axisY: Math.random() * 2 - 1,
        speedX: Math.random() > -1 ? 0.005 : -0.005,
        speedY: Math.random() > 0.3 ? 0.001 : -0.001,
        clicked: false,
        img,
    });

    const [elements, setElements] = useState<Element[]>(() =>
        catConsts.map(({ img, id }) => generateRandomPosition(img, id))
    );

    const handleCatClick = (catId: number) => {
        setElements((prevElements) =>
            prevElements.map((element) => {
                if (element.id !== catId) {
                    return element;
                }
                if (element.clicked) {
                    const clickedCat = catConsts.find((cat) => cat.id === catId);

                    if (clickedCat) {
                        onClickCallback(clickedCat);
                        return {
                            ...element,
                            clicked: false,
                            isMoving: false,
                        };
                    }
                }
                const updatedElement = {
                    ...element,
                    isMoving: !element.isMoving,
                    clicked: true,
                };

                setTimeout(() => {
                    setElements((prevElements) =>
                        prevElements.map((el) =>
                            el.id === element.id ? { ...el, isMoving: false } : el
                        )
                    );
                }, 10000);

                return updatedElement;
            })
        );
    };

    useEffect(() => {
        const updateElements = () => {
            setElements((prevElements) =>
                prevElements.map((element) => {
                    if (!element.isMoving) {
                        return {
                            ...element,
                            axisX: element.axisX + element.speedX,
                            axisY: element.axisY + element.speedY,
                        };
                    }
                    return element;
                })
            );
        };

        const handleCollision = (element: Element) => {
            if (Math.abs(element.axisX) >= 1) {
                element.speedX *= -1;
            }

            if (Math.abs(element.axisY) >= 1) {
                element.speedY *= -1;
            }
        };

        const animate = () => {
            updateElements();
            setElements((prevElements) => {
                const updatedElements = prevElements.map((element) => ({ ...element }));
                updatedElements.forEach(handleCollision);
                return updatedElements;
            });

            requestAnimationFrame(animate);
        };

        const animationId = requestAnimationFrame(animate);

        return () => {
            cancelAnimationFrame(animationId);
        };
    }, []);

    const [dimension, setDimension] = useState({ width: 0, height: 0, scaleFactor: 0 });

    useEffect(() => {

        const handleResize = () => {
            const screenWidth = window.innerWidth;
            const scaleFactor = screenWidth > 600 ? 2.2 : 3;
            setDimension({ width: screenWidth, height: window.innerHeight, scaleFactor });
        };

        handleResize();

        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
        };
    }, []);

    const getCatStyle = (element: Element) => ({
        left: `${((element.axisX + 1) * dimension.width) / dimension.scaleFactor}px`,
        top: `${((element.axisY + 1) * dimension.height) / 2.5}px`,
        transform: `scaleX(${element.speedX < 0 ? -1 : 1})`,
    });
    return (
        <div className="relative w-screen h-screen overflow-hidden">
            <img className="absolute z-0 w-full h-full object-fit" src="/catgame/bg.jpg" />
            {elements.map((element) => (
                <Image
                    src={element.img}
                    key={element.id}
                    className="absolute left-0 top-0 w-44 h-44"
                    width={180}
                    height={180}
                    alt="cat gif"
                    style={getCatStyle(element)}
                    onClick={() => handleCatClick(element.id)}
                    priority
                />
            ))}
        </div>
    );
};
