import { useEffect, useMemo, useState } from "react";

const bgImages = [
  "url(/backgrounds/bg-1.webp)",
  "url(/backgrounds/bg-2.webp)",
  "url(/backgrounds/bg-3.webp)",
  "url(/backgrounds/bg-4.webp)",
  "url(/backgrounds/bg-5.webp)",
  "url(/backgrounds/bg-6.webp)",
  "url(/backgrounds/bg-7.webp)",
  "url(/backgrounds/bg-8.webp)",
  "url(/backgrounds/bg-1.webp)",
  "url(/backgrounds/bg-1.webp)",
  "url(/backgrounds/bg-2.webp)",
  "url(/backgrounds/bg-3.webp)",
  "url(/backgrounds/bg-4.webp)",
  "url(/backgrounds/bg-5.webp)",
  "url(/backgrounds/bg-6.webp)",
  "url(/backgrounds/bg-7.webp)",
  "url(/backgrounds/bg-8.webp)",
  "url(/backgrounds/bg-1.webp)",
  "url(/backgrounds/bg-2.webp)",
  "url(/backgrounds/bg-3.webp)",
  "url(/backgrounds/bg-4.webp)",
  "url(/backgrounds/bg-5.webp)",
  "url(/backgrounds/bg-6.webp)",
  "url(/backgrounds/bg-7.webp)",
  "url(/backgrounds/bg-8.webp)",
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
      backgroundImage: bgImages[hours] || "url(/backgrounds/bg-5.webp)",
    };
  }, []);

  return bgHour;
};

export const useLocalStorage = <T>(key: string) => {
  const [value, setValue] = useState<T>(() => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : null;
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error);
      return null;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error(`Error setting localStorage key "${key}":`, error);
    }
  }, [key, value]);

  return [value, setValue] as const;
};
