import React from "react";

const Snowfall: React.FC<{ isSmall?: boolean }> = ({ isSmall = false }) => {
  return (
    <div className="absolute snowfall inset-0 w-screen h-screen overflow-hidden z-0 pointer-events-none">
      {Array.from({ length: 50 }).map((_, i) => (
        <div className={`snowflake ${isSmall ? "small" : ""}`} key={i} />
      ))}
    </div>
  );
};

export default Snowfall;
