import React from "react";

export const AppCTA = () => {
  return (
    <div
      className="flex flex-col gap-4 w-full px-2 py-4 rounded-xl font-secondary font-bold"
      style={{
        backgroundImage: "url(/backgrounds/bg-6.png)",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="flex gap-4 items-center justify-center">
        <img
          draggable={false}
          className="w-16 h-16"
          src="/purrquest/sprites/key.png"
        />
        <p className="text-p3 md:text-p2 text-center">
          Download the app to unlock!
        </p>
      </div>
    </div>
  );
};
