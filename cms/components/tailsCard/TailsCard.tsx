import { CatAbilityType, CatAbilityTypes, ICat } from '@/models/cats';
import React, { useCallback, useMemo, useState } from 'react';
import { CardBack } from './CardBack';
import { CardFront } from './CardFront';
import { CardWrapper } from './CardWrapper';

type Props = {
  cat?: ICat;
};

export const TailsCard: React.FC<Props> = ({ cat }) => {
  const [flipped, setFlipped] = useState(true);

  const handleFlip = useCallback(() => {
    setFlipped((prev) => !prev);
  }, []);

  // Unknown ability types render as FAIRY. Normalise a copy instead of
  // mutating the prop so the caller's object is left untouched.
  const displayCat = useMemo(() => {
    if (!cat || CatAbilityTypes.includes(cat.type)) {
      return cat;
    }
    return { ...cat, type: CatAbilityType.FAIRY };
  }, [cat]);

  if (!displayCat) return null;

  const blessing = displayCat.blessing;

  return (
    <>
      <div
        onClick={handleFlip}
        className="animate-opacity cursor-pointer inline-block [perspective:1000px]"
        style={{ WebkitPerspective: '1000px' }}
      >
        <div
          className="relative touch-none max-sm:pointer-events-none select-none transition-transform [transition-duration:0.6s] [transform-style:preserve-3d]"
          style={{
            transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
            WebkitTransformStyle: 'preserve-3d'
          }}
        >
          <div
            className="[backface-visibility:hidden] [transform:translateZ(0)]"
            style={{
              WebkitBackfaceVisibility: 'hidden',
              WebkitTransform: 'translateZ(0)'
            }}
          >
            <CardWrapper catType={displayCat.type}>
              <CardFront cat={displayCat} blessing={blessing} />
            </CardWrapper>
          </div>

          <div
            className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)_translateZ(0)]"
            style={{
              WebkitBackfaceVisibility: 'hidden',
              WebkitTransform: 'rotateY(180deg) translateZ(0)'
            }}
          >
            <CardWrapper catType={displayCat.type} isBackSide={true}>
              <CardBack cat={displayCat} blessing={blessing} />
            </CardWrapper>
          </div>
        </div>
      </div>
    </>
  );
};
