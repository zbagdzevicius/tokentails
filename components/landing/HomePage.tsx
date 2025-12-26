export const HomePage = () => {
  return (
    <div className="flex items-center flex-col w-full h-full relative z-30">
      <h1 className="xl:mt-6 text-balance text-center font-paws uppercase z-0 tracking-tight text-h5 sm:text-h2 lg:text-[120px] xl:text-[140px] 2xl:text-[180px] 3xl:text-[200px] lg:mb-4">
        <span className="text-yellow-300 drop-shadow-[0_2.4px_1.8px_rgba(0,0,0)]">
          YOUR
        </span>{" "}
        <span className="glow text-yellow-900">CAT AWAITS</span>
      </h1>
      <h2 className="text-yellow-900 border-yellow-300/50 border-4 text-balance text-center font-primary uppercase z-0 tracking-tight text-p5 md:text-p2 bg-yellow-300/50 2xl:mt-4 px-4 md:px-8 rounded-full">
        READY TO{" "}
        <span className="text-yellow-300 drop-shadow-[0_2.4px_1.8px_rgba(0,0,0)]">
          PLAY
        </span>{" "}
        AND READY TO{" "}
        <span className="text-yellow-300 drop-shadow-[0_2.4px_1.8px_rgba(0,0,0)]">
          SAVE
        </span>
      </h2>
    </div>
  );
};
