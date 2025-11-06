export const HomePage = () => {
  return (
    <div className="flex items-center flex-col w-full h-full relative">
      <h1 className="xl:mt-6 text-balance text-center font-primary uppercase z-0 tracking-tight text-h4 sm:text-h2 lg:text-[120px] xl:text-[160px] 2xl:text-[180px] 3xl:text-[200px]">
        <span className="text-yellow-300 drop-shadow-[0_2.4px_1.8px_rgba(0,0,0)]">
          YOUR
        </span>{" "}
        PLAYABLE CAT
      </h1>
      <h2 className="text-balance text-center font-primary uppercase z-0 tracking-tight text-p5 sm:text-h6 sm:py-2 lg:py-0 lg:text-h5 bg-yellow-300/50 2xl:mt-4 px-4 md:px-12 rounded-full">
        <span className="text-yellow-300 drop-shadow-[0_2.4px_1.8px_rgba(0,0,0)]">
          LINKED
        </span>{" "}
        WITH A REAL CAT IN A SHELTER
      </h2>
    </div>
  );
};
