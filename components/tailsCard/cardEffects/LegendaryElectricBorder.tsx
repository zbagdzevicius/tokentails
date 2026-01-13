import React, { useEffect, useRef } from "react";

type LegendaryElectricBorderProps = {
  borderColor: string;
};

export const LegendaryElectricBorderSVG: React.FC = () => {
  const offset1Ref = useRef<SVGFEOffsetElement>(null);
  const offset2Ref = useRef<SVGFEOffsetElement>(null);
  const offset3Ref = useRef<SVGFEOffsetElement>(null);
  const offset4Ref = useRef<SVGFEOffsetElement>(null);

  useEffect(() => {
    const startTime = performance.now();
    const duration = 6000; // 6 seconds

    const animate = (currentTime: number) => {
      const elapsed = (currentTime - startTime) % duration;
      const progress = elapsed / duration; // 0 to 1

      if (offset1Ref.current) {
        const dy1 = 700 - progress * 700; // 700 to 0
        offset1Ref.current.setAttribute("dy", dy1.toString());
      }

      if (offset2Ref.current) {
        const dy2 = -progress * 700; // 0 to -700
        offset2Ref.current.setAttribute("dy", dy2.toString());
      }

      if (offset3Ref.current) {
        const dx3 = 490 - progress * 490; // 490 to 0
        offset3Ref.current.setAttribute("dx", dx3.toString());
      }

      if (offset4Ref.current) {
        const dx4 = -progress * 490; // 0 to -490
        offset4Ref.current.setAttribute("dx", dx4.toString());
      }

      requestAnimationFrame(animate);
    };

    const animationId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationId);
  }, []);

  return (
    <svg
      className="absolute pointer-events-none"
      style={{ width: 0, height: 0, position: "absolute" }}
    >
      <defs>
        <filter
          id="legendary-turbulent-displace"
          colorInterpolationFilters="sRGB"
          x="-20%"
          y="-20%"
          width="140%"
          height="140%"
        >
          <feTurbulence
            type="turbulence"
            baseFrequency="0.02"
            numOctaves={10}
            result="noise1"
            seed={1}
          />
          <feOffset
            ref={offset1Ref}
            in="noise1"
            dx={0}
            dy={700}
            result="offsetNoise1"
          />

          <feTurbulence
            type="turbulence"
            baseFrequency="0.02"
            numOctaves={10}
            result="noise2"
            seed={1}
          />
          <feOffset
            ref={offset2Ref}
            in="noise2"
            dx={0}
            dy={0}
            result="offsetNoise2"
          />

          <feTurbulence
            type="turbulence"
            baseFrequency="0.02"
            numOctaves={10}
            result="noise3"
            seed={2}
          />
          <feOffset
            ref={offset3Ref}
            in="noise3"
            dx={490}
            dy={0}
            result="offsetNoise3"
          />

          <feTurbulence
            type="turbulence"
            baseFrequency="0.02"
            numOctaves={10}
            result="noise4"
            seed={2}
          />
          <feOffset
            ref={offset4Ref}
            in="noise4"
            dx={0}
            dy={0}
            result="offsetNoise4"
          />

          <feComposite in="offsetNoise1" in2="offsetNoise2" result="part1" />
          <feComposite in="offsetNoise3" in2="offsetNoise4" result="part2" />
          <feBlend
            in="part1"
            in2="part2"
            mode="color-dodge"
            result="combinedNoise"
          />

          <feDisplacementMap
            in="SourceGraphic"
            in2="combinedNoise"
            scale={30}
            xChannelSelector="R"
            yChannelSelector="B"
          />
        </filter>
      </defs>
    </svg>
  );
};

export const LegendaryElectricBorder: React.FC<
  LegendaryElectricBorderProps
> = ({ borderColor }) => {
  // Convert hex color to RGB for opacity calculations
  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : { r: 221, g: 132, b: 72 }; // fallback color
  };

  const rgb = hexToRgb(borderColor);
  const rgbaBase = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}`;

  return (
    <>
      {/* Border container with outer border and offset effect */}
      <div
        className="absolute inset-0 rounded-[20px] pointer-events-none"
        style={{
          border: `2px solid ${rgbaBase}, 0.5)`,
          paddingRight: "4px",
          paddingBottom: "4px",
        }}
      >
        {/* Main animated border */}
        <div
          className="w-full h-full rounded-[20px]"
          style={{
            border: `2px solid ${borderColor}`,
            marginTop: "-4px",
            marginLeft: "-4px",
            filter: "url(#legendary-turbulent-displace)",
          }}
        />
      </div>

      {/* Glow Layer 1 - Subtle blur */}
      <div
        className="absolute inset-0 rounded-[20px] pointer-events-none"
        style={{
          border: `2px solid ${rgbaBase}, 0.6)`,
          filter: "blur(1px)",
        }}
      />

      {/* Glow Layer 2 - Stronger blur */}
      <div
        className="absolute inset-0 rounded-[20px] pointer-events-none"
        style={{
          border: `2px solid ${borderColor}`,
          filter: "blur(4px)",
        }}
      />

      {/* Overlay 1 - Strong overlay effect */}
      <div
        className="absolute inset-0 rounded-[20px] pointer-events-none"
        style={{
          opacity: 1,
          mixBlendMode: "overlay",
          transform: "scale(1.1)",
          filter: "blur(16px)",
          background:
            "linear-gradient(-30deg, white, transparent 30%, transparent 70%, white)",
        }}
      />

      {/* Overlay 2 - Medium overlay effect */}
      <div
        className="absolute inset-0 rounded-[20px] pointer-events-none"
        style={{
          opacity: 0.5,
          mixBlendMode: "overlay",
          transform: "scale(1.1)",
          filter: "blur(16px)",
          background:
            "linear-gradient(-30deg, white, transparent 30%, transparent 70%, white)",
        }}
      />

      {/* Background glow */}
      <div
        className="absolute inset-0 rounded-[20px] pointer-events-none"
        style={{
          filter: "blur(32px)",
          transform: "scale(1.1)",
          opacity: 0.3,
          zIndex: -1,
          background: `linear-gradient(-30deg, ${borderColor}, transparent, ${borderColor})`,
        }}
      />
    </>
  );
};
