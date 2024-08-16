"use client";
import { ICat } from "@/models/cats";
import { useEffect, useState } from "react";

interface Element {
  id: string;
  axisX: number;
  axisY: number;
  speedX: number;
  speedY: number;
  isMoving?: boolean;
  clicked: boolean;
  img: string;
}

interface IProps {
  cats: ICat[];
  onClickCallback: (cat: ICat) => void;
}

export const CatGame = ({ cats, onClickCallback }: IProps) => {
  const generateRandomPosition = (img: string, id: string): Element => ({
    id: id,
    axisX: Math.random() * 2 - 1,
    axisY: Math.random() * 2 - 1,
    speedX: Math.random() > -1 ? 0.005 : -0.005,
    speedY: Math.random() > 0.3 ? 0.001 : -0.001,
    clicked: false,
    img,
  });

  const [elements, setElements] = useState<Element[]>([]);
  useEffect(() => {
    if (cats?.length) {
      setElements(cats.map(({ catImg, _id }, index) =>
        generateRandomPosition(catImg, _id!)
      ));
    }
  }, [cats]);

  const handleCatClick = (catId: string) => {
    setElements((prevElements) =>
      prevElements.map((element) => {
        const clickedCat = cats.find((cat) => cat._id === catId);

        if (clickedCat) {
          onClickCallback(clickedCat);
          return {
            ...element,
            clicked: false,
            isMoving: false,
          };
        }
        const updatedElement = {
          ...element,
          isMoving: !element.isMoving,
          clicked: true,
        };

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

  const [dimension, setDimension] = useState({
    width: 0,
    height: 0,
    scaleFactor: 0,
  });

  useEffect(() => {
    const handleResize = () => {
      const screenWidth = window.innerWidth;
      const scaleFactor = screenWidth > 600 ? 2.2 : 3;
      setDimension({
        width: screenWidth,
        height: window.innerHeight,
        scaleFactor,
      });
    };

    handleResize();

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const getCatStyle = (element: Element) => ({
    left: `${
      ((element.axisX + 1) * dimension.width) / dimension.scaleFactor
    }px`,
    top: `${((element.axisY + 1) * dimension.height) / 2.5}px`,
    transform: `scaleX(${element.speedX < 0 ? -1 : 1})`,
  });
  return (
    <div className="relative w-screen h-screen overflow-hidden">
      <div
        draggable="false"
        className="absolute z-0 w-full h-full object-fit"
        style={{
          backgroundImage: "url(/catgame/bg.jpg)",
          backgroundRepeat: "repeat",
          backgroundSize: "500px",
        }}
      ></div>
      {elements.map((element, index) => (
        <img
          draggable="false"
          src={element.img}
          key={index}
          className="absolute left-0 top-0 w-24 h-24"
          alt="cat gif"
          style={getCatStyle(element)}
          onClick={() => handleCatClick(element.id)}
        />
      ))}
    </div>
  );
};
