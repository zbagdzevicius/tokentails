import React from "react";
import Confetti from "react-confetti";

const COIN_WIDTH = 50;
const COIN_RADIUS = COIN_WIDTH / 2; // Radius is half of the width

export const ConfettiWrapper = () => {
  return (
    <div className="fixed w-full z-[100] h-full inset-0">
      <Confetti
        width={window.innerWidth}
        height={window.innerHeight}
        colors={["#000"]}
        gravity={0.2}
        initialVelocityX={1}
        initialVelocityY={5}
        numberOfPieces={15}
        drawShape={(ctx) => {
          // Body (smaller)
          // Draw the outer circle (golden coin)
          ctx.beginPath();
          ctx.arc(100, 100, COIN_RADIUS, 0, Math.PI * 2, false); // Outer circle
          ctx.fillStyle = "gold";
          ctx.fill();

          // Add shading for a 3D effect
          let gradient = ctx.createRadialGradient(
            100,
            100,
            COIN_RADIUS / 2,
            100,
            100,
            COIN_RADIUS
          );
          gradient.addColorStop(0, "rgba(255, 255, 255, 0.4)"); // Light center
          gradient.addColorStop(1, "rgba(255, 215, 0, 1)"); // Dark outer edge

          ctx.fillStyle = gradient;
          ctx.fill();

          // Draw the inner circle rim
          ctx.beginPath();
          ctx.arc(100, 100, COIN_RADIUS * 0.8, 0, Math.PI * 2, false); // Inner circle for rim
          ctx.lineWidth = COIN_RADIUS * 0.1; // Adjust line width for the rim
          ctx.strokeStyle = "#DAA520"; // Darker gold for the rim
          ctx.stroke();

          // Draw eyes (relative to coin size)
          const eyeRadius = COIN_RADIUS * 0.1; // Eyes are smaller, 10% of the coin radius
          const eyeOffsetX = COIN_RADIUS * 0.35; // Horizontal offset for eyes
          const eyeOffsetY = COIN_RADIUS * 0.2; // Vertical offset for eyes

          ctx.beginPath();
          ctx.arc(
            100 - eyeOffsetX,
            100 - eyeOffsetY,
            eyeRadius,
            0,
            Math.PI * 2,
            false
          ); // Left eye
          ctx.arc(
            100 + eyeOffsetX,
            100 - eyeOffsetY,
            eyeRadius,
            0,
            Math.PI * 2,
            false
          ); // Right eye
          ctx.fillStyle = "black";
          ctx.fill();

          // Draw the smile (relative to coin size)
          const smileRadius = COIN_RADIUS * 0.4; // Smile size as a percentage of the coin radius
          const smileOffsetY = COIN_RADIUS * 0.2; // Smile position slightly below center

          ctx.beginPath();
          ctx.arc(100, 100 + smileOffsetY, smileRadius, 0, Math.PI, false); // Smile (arc)
          ctx.lineWidth = COIN_RADIUS * 0.05; // Adjust line width for the smile
          ctx.strokeStyle = "black";
          ctx.stroke();
          ctx.closePath();
        }}
      />
    </div>
  );
};
