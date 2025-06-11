export const ProcessExplained = () => {
  return (
    <>
      <div className="flex items-center justify-center flex-col my-32">
        <h2 className="text-center font-primary uppercase tracking-tight text-h6 md:text-h2 lg:text-h1 text-balance mt-3 px-4">
          HOW{" "}
          <span className="text-yellow-300 drop-shadow-[0_2.4px_1.8px_rgba(0,0,0)]">
            YOU
          </span>{" "}
          CAN SAVE A CAT
        </h2>
        <h3 className="text-center font-primary uppercase tracking-tight text-p5 md:text-p2 lg:text-h6 text-balance mb-3 px-4">
          100% OF YOUR DONATIONS GO TO SHELTERS
        </h3>

        <div className="flex justify-center flex-col md:flex-row gap-4">
          <div
            style={{
              backgroundImage: "url(/backgrounds/bg-9.webp)",
              backgroundSize: "cover",
              backgroundPosition: "top",
            }}
            className="animate-brightness md:mt-48 relative border flex flex-col items-center justify-center w-40 h-40 rounded-full hover:brightness-110"
          >
            <div className="z-10 text-center pt-2 rounded-full flex items-center flex-col justify-center text-p2 leading-none font-primary">
              <span className="text-yellow-300 drop-shadow-[0_2.4px_1.8px_rgba(0,0,0)] w-full text-center">
                SHELTER
              </span>
              <div>SUBMITS CAT</div>
            </div>
            <img
              className="w-24 h-24 -mb-6 rounded-full hover:brightness-110"
              src="team/feta-sad.webp"
            />
          </div>
          <div className="md:mt-40 flex flex-col items-center justify-center pt-2 md:pt-0">
            <img
              className="w-12 rotate-180 md:rotate-[60deg]"
              src="logo/arrow.webp"
            />
          </div>
          <div
            style={{
              backgroundImage: "url(/backgrounds/bg-4.webp)",
              backgroundSize: "cover",
              backgroundPosition: "top",
            }}
            className="animate-brightness animate-delay-1000 md:mt-32 relative border flex flex-col items-center justify-center w-40 h-40 rounded-full hover:brightness-110"
          >
            <img
              className="w-32 h-32 pixelated -mb-8 -mt-20 -mx-6"
              src="https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/MAINE/coins/GROOMING.gif"
            />
            <div className="z-10 text-center pt-2 text-pretty rounded-full flex items-center justify-center text-p2 leading-none font-primary">
              <div>
                <span className="text-yellow-300 drop-shadow-[0_2.4px_1.8px_rgba(0,0,0)] mr-1">
                  WE
                </span>
                CREATE VIRTUAL TWIN
              </div>
            </div>
          </div>
          <div className="md:mt-8 flex flex-col items-center justify-center">
            <img
              className="w-12 rotate-180 md:rotate-[60deg]"
              src="logo/arrow.webp"
            />
          </div>
          <div
            style={{
              backgroundImage: "url(/backgrounds/bg-6.webp)",
              backgroundSize: "cover",
              backgroundPosition: "top",
            }}
            className="animate-hover animate-delay-2000 md:mt-16 relative border flex flex-col items-center justify-center w-40 h-40 rounded-full hover:brightness-110"
          >
            <div className="z-10 text-center pt-2 text-pretty rounded-full flex items-center justify-center text-p2 leading-none font-primary">
              <div>
                <span className="text-yellow-300 drop-shadow-[0_2.4px_1.8px_rgba(0,0,0)] mr-1">
                  YOU
                </span>
                ADOPT VIRTUAL TWIN
              </div>
            </div>
            <img
              className="w-16 h-auto pixelated -mb-4"
              src="logo/human.webp"
            />
          </div>
          <div className="md:-mt-28 flex flex-col items-center justify-center">
            <img
              className="w-12 rotate-180 md:rotate-[60deg]"
              src="logo/arrow.webp"
            />
          </div>
          <div
            style={{
              backgroundImage: "url(/backgrounds/bg-5.webp)",
              backgroundSize: "cover",
              backgroundPosition: "top",
            }}
            className="animate-brightness relative border flex flex-col items-center justify-center w-40 h-40 rounded-full hover:brightness-110"
          >
            <img
              className="w-24 h-24 md:-mt-6 rounded-full hover:brightness-110"
              src="team/feta-happy.webp"
            />
            <div className="z-10 text-center pt-2 text-pretty rounded-full flex items-center justify-center text-p2 leading-none font-primary">
              <div>
                <span className="text-yellow-300 drop-shadow-[0_2.4px_1.8px_rgba(0,0,0)] mr-1">
                  CAT
                </span>
                GETS TREATED
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
