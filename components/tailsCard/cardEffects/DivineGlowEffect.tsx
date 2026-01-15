import React from "react";
import { Tier } from "@/models/cats";

type DivineGlowEffectProps = {
  tier: Tier;
};

export const DivineGlowEffect: React.FC<DivineGlowEffectProps> = ({ tier }) => {
  const getGlowClassName = () => {
    switch (tier) {
      case Tier.COMMON:
        return "divine-glow-common";
      case Tier.RARE:
        return "divine-glow-rare";
      case Tier.EPIC:
        return "divine-glow-epic";
      default:
        return "divine-glow-common";
    }
  };

  const getGlowStyle = () => {
    switch (tier) {
      case Tier.COMMON:
        return {
          background:
            "radial-gradient(ellipse at center, transparent 30%, rgba(255, 237, 194, 0.15) 70%, rgba(255, 237, 194, 0.35) 100%)",
        };
      case Tier.RARE:
        return {
          background:
            "radial-gradient(ellipse at center, transparent 30%, rgba(100, 200, 255, 0.25) 60%, rgba(150, 180, 255, 0.4) 80%, rgba(180, 150, 255, 0.5) 100%)",
        };
      case Tier.EPIC:
        return {
          background:
            "radial-gradient(ellipse at center, transparent 30%, rgba(179,136,255,0.18) 60%, rgba(255,128,171,0.22) 80%, rgba(124,58,237,0.32) 100%)",
        };
      default:
        return {
          background:
            "radial-gradient(ellipse at center, transparent 30%, rgba(255, 237, 194, 0.15) 70%, rgba(255, 237, 194, 0.35) 100%)",
        };
    }
  };

  return (
    <div
      className={`absolute inset-0 rounded-[20px] ${getGlowClassName()} pointer-events-none`}
      style={{
        ...getGlowStyle(),
        zIndex: 200,
      }}
    />
  );
};
