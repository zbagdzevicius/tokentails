import { useMemo } from "react";

const bgImages = [
  "url(/backgrounds/bg.gif)",
  "url(/backgrounds/bg-2.gif)",
  "url(/backgrounds/bg-3.gif)",
  "url(/backgrounds/bg-4.gif)",
  "url(/backgrounds/bg-5.png)",
  "url(/backgrounds/bg-6.png)",
  "url(/backgrounds/bg-6.png)",
  "url(/backgrounds/bg-7.png)",
  "url(/backgrounds/bg-8.gif)",
  "url(/backgrounds/bg.gif)",
  "url(/backgrounds/bg-night.png)",
  "url(/backgrounds/bg-night-2.png)",
  "url(/backgrounds/bg-4.gif)",
  "url(/backgrounds/bg-5.png)",
  "url(/backgrounds/bg-6.png)",
  "url(/backgrounds/bg-6.png)",
  "url(/backgrounds/bg-night.png)",
  "url(/backgrounds/bg-night-2.png)",
  "url(/backgrounds/bg.gif)",
  "url(/backgrounds/bg-2.gif)",
  "url(/backgrounds/bg-3.gif)",
  "url(/backgrounds/bg-4.gif)",
  "url(/backgrounds/bg-5.png)",
  "url(/backgrounds/bg-6.png)",
  "url(/backgrounds/bg-6.png)",
  "url(/backgrounds/bg-7.png)",
  "url(/backgrounds/bg-8.gif)",
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
      backgroundImage: "url(/backgrounds/bg-night.png)",
    };
  }, []);

  return bgHour;
};
