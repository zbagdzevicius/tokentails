import { useMemo } from "react";

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
      backgroundImage:
        hours > 17 || hours < 6
          ? "url(/base/bg-night-2.gif)"
          : "url(/base/bg-4.gif)",
    };
  }, []);

  return bgHour;
};
