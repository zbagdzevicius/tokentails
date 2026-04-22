import React from "react";
import { CommonCardEffects } from "./cardEffects/CommonCardEffects";
import { RareCardEffects } from "./cardEffects/RareCardEffects";
import { LegendaryCardEffects } from "./cardEffects/LegendaryCardEffects";
import { Tier } from "@/models/cats";
import { EpicCardEffects } from "./cardEffects/EpicCardEffects";

type CardEffectsProps = {
  tier: Tier;
};

export const CardEffects: React.FC<CardEffectsProps> = ({ tier }) => {
  const renderTierEffects = () => {
    switch (tier) {
      case Tier.COMMON:
        return <CommonCardEffects />;
      case Tier.RARE:
        return <RareCardEffects />;
      case Tier.EPIC:
        return <EpicCardEffects />;
      case Tier.LEGENDARY:
        return <LegendaryCardEffects />;
      default:
        return null;
    }
  };

  return <>{renderTierEffects()}</>;
};
