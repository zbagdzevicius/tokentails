import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./layouts/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        accent: {
          100: "#E6E6FA",
          200: "#C8A2C8",
          300: "#9966CC",
          400: "#7851A9",
          500: "#4B0082",
          DEFAULT: "#4B0082",
          600: "#6F2DA8",
          700: "#431C53",
          800: "#702963",
          900: "#301934",
        },
        yellow: {
          300: "#FCECBB",
        },
        green: {
          300: "#D5F4E5",
        },
        purple: {
          300: "#F0C5FD",
        },
        blue: {
          300: "#C4E2FC",
        },
        main: {
          black: "#161616",
          white: "#FFFFFF",
          ember: "#C1260F",
          rusty: "#EE642A",

          slate: "#A1A1A1",

          grape: "#8726B7",

          midnight: "#1E293B",
          gray: "#CBD5E1",
        },
      },
      animation: {
        "loop-scroll": "loop-scroll 50s linear infinite",
        hover: "hover 5s infinite;",
        colormax: "colormax 15s infinite;",
        "spin-slow": "spin 10s infinite;",
        flip: "flip 10s infinite;",
        appear: "appear 0.5s;",
        opacity: "opacity 1.5s;",
        bounceWithFade: "bounceWithFade 2.5s ease-in-out",
        brightness: "brightness 3s ease-in-out infinite",
      },
      keyframes: {
        "loop-scroll": {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(-100%)" },
        },
        brightness: {
          from: { filter: "brightness(1)" },
          "50%": { filter: "brightness(1.1)" },
          to: { filter: "brightness(1)" },
        },
        bounceWithFade: {
          "0%": {
            transform: "translateY(-100%)",
            opacity: "0",
            animationTimingFunction: "cubic-bezier(0.8, 0, 1, 1)",
          },
          "5%": {
            transform: "translateY(0)",
            opacity: "1",
            animationTimingFunction: "cubic-bezier(0.2, 0, 0.5, 1)",
          },
          "50%": {
            transform: "translateY(0)",
            opacity: "1",
            animationTimingFunction: "cubic-bezier(0, 0, 0.2, 1)",
          },
          "90%": {
            transform: "translateY(0)",
            opacity: "1",
            animationTimingFunction: "cubic-bezier(0, 0, 0.2, 1)",
          },
          "100%": {
            transform: "translateY(-100%)",
            opacity: "0",
            animationTimingFunction: "cubic-bezier(0.8, 0, 1, 1)",
          },
        },
        appear: {
          from: { opacity: "0", "margin-top": "-80px" },
          to: { opacity: "1", "margin-top": "0px" },
        },
        opacity: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        flip: {
          "0%, 100%": {
            transform: "skew(0deg, 0deg)",
            "border-radius": "0",
            opacity: "0.5",
          },
          "50%": {
            transform: "skew(90deg, 60deg)",
            "border-radius": "90px",
            opacity: "0.2",
          },
        },
        hover: {
          "0%, 100%": {
            transform: "translateY(-4%)",
          },
          "50%": {
            transform: "translateY(0)",
          },
        },
        colormax: {
          "0%, 100%": {
            filter: "hue-rotate(0deg)",
          },
          "50%": {
            filter: "hue-rotate(360deg)",
          },
        },
      },
      fontSize: {
        h1: [
          "6rem",
          {
            lineHeight: "6.75rem",
          },
        ],
        h2: [
          "4.75rem",
          {
            lineHeight: "5.25rem",
          },
        ],
        h3: [
          "3.5rem",
          {
            lineHeight: "3rem",
          },
        ],
        h4: [
          "3.25rem",
          {
            lineHeight: "3.5rem",
          },
        ],
        h5: [
          "2.875rem",
          {
            lineHeight: "3.2rem",
          },
        ],
        h6: [
          "2.5rem",
          {
            lineHeight: "2rem",
          },
        ],
        p1: [
          "2.25rem",
          {
            lineHeight: "1.375em",
            letterSpacing: "-0.015625rem",
          },
        ],
        p2: [
          "1.75rem",
          {
            lineHeight: "1.375em",
            letterSpacing: "-0.015625rem",
          },
        ],
        p3: [
          "1.5rem",
          {
            lineHeight: "1.375em",
            letterSpacing: "-0.015625rem",
          },
        ],
        p4: [
          "1.25rem",
          {
            lineHeight: "1.375em",
            letterSpacing: "-0.015625rem",
          },
        ],
        p5: [
          "1rem",
          {
            lineHeight: "1.375em",
            letterSpacing: "-0.015625rem",
          },
        ],
        p6: [
          "0.75rem",
          {
            lineHeight: "1rem",
            letterSpacing: "-0.015625rem",
          },
        ],
        p7: [
          "0.625rem",
          {
            lineHeight: "1rem",
            letterSpacing: "-0.015625rem",
          },
        ],
      },
      boxShadow: {
        custom: `
          0 4px black, 
          0 8px black, 
          0 12px black, 
          0 16px black, 
          -4px 12px black, 
          -8px 8px black, 
          -12px 4px black, 
          -4px 4px white, 
          -8px 4px white, 
          -4px 8px white, 
          -4px 0 white, 
          -8px 0 white, 
          -12px 0 white
        `,
      },
      screens: {
        md: "667px",
        "3xl": "2300px",
      },
    },
    fontFamily: {
      primary: ["Passion One", "sans-serif"],
      secondary: ["Bebas Neue", "sans-serif"],
      tertiary: ["Nunito", "sans-serif"],
      pixel: ["Pixelify Sans", "sans-serif"],
    },
  },
  plugins: [require("tailwindcss-convert-px-to-rem")],
};
export default config;
