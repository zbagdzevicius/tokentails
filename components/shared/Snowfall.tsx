import React from "react";

const Snowfall: React.FC = () => {
  return (
    <div className="absolute inset-0 w-screen h-screen overflow-hidden">
      {Array.from({ length: 50 }).map((_, i) => (
        <div className="chamomile-flower" key={i} />
      ))}
    </div>
  );
};

export default Snowfall;
