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
      },
      animation: {
        "loop-scroll": "loop-scroll 50s linear infinite",
        hover: "hover 5s infinite;",
        colormax: "colormax 15s infinite;",
        "spin-slow": "spin 10s infinite;",
        flip: "flip 10s infinite;",
      },
      keyframes: {
        "loop-scroll": {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(-100%)" },
        },
        flip: {
          "0%, 100%": { transform: "skew(0deg, 0deg)", "border-radius": "0", "opacity": "0.5" },
          "50%": { transform: "skew(90deg, 60deg)", "border-radius": "90px", "opacity": "0.2" },
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
      },
    },
  },
  plugins: [],
};
export default config;
