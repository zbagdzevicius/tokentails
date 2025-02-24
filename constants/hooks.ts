import { useMemo } from "react";

const bgImages = [
  "url(/base/bg.gif)",
  "url(/base/bg-2.gif)",
  "url(/base/bg-3.gif)",
  "url(/base/bg-4.gif)",
  "url(/base/bg-5.png)",
  "url(/base/bg-6.png)",
  "url(/base/bg-6.png)",
  "url(/base/bg-7.png)",
  "url(/base/bg-8.gif)",
  "url(/base/bg.gif)",
  "url(/base/bg-2.gif)",
  "url(/base/bg-3.gif)",
  "url(/base/bg-4.gif)",
  "url(/base/bg-5.png)",
  "url(/base/bg-6.png)",
  "url(/base/bg-6.png)",
  "url(/base/bg-7.png)",
  "url(/base/bg-8.gif)",
  "url(/base/bg.gif)",
  "url(/base/bg-2.gif)",
  "url(/base/bg-3.gif)",
  "url(/base/bg-4.gif)",
  "url(/base/bg-5.png)",
  "url(/base/bg-6.png)",
  "url(/base/bg-6.png)",
  "url(/base/bg-7.png)",
  "url(/base/bg-8.gif)",
];

export const useBackground = () => {
  const bgHour = useMemo(() => {
    const coreBg = {
      backgroundRepeat: "no-repeat",
      backgroundSize: "cover",
      backgroundPosition: "center bottom",
    };
    const hours = new Date().getHours();
    return {
      ...coreBg,
      backgroundImage: bgImages[hours] || "url(/base/bg-6.png)",
    };
  }, []);

  return bgHour;
};
