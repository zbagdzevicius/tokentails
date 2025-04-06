export const ProcessExplained = () => {
  return (
    <>
      <div className="flex items-center justify-center flex-col my-32">
        <h2 className="text-center font-primary uppercase tracking-tight text-h6 md:text-h2 lg:text-h1 text-balance my-3 px-4">
          HOW YOU CAN SAVE A CAT
        </h2>

        <div className="flex justify-center flex-col md:flex-row gap-4">
          <div
            style={{
              backgroundImage: "url(/backgrounds/bg-7.png)",
              backgroundSize: "cover",
              backgroundPosition: "top",
            }}
            className="animate-brightness md:mt-48 relative border flex flex-col items-center justify-center w-40 h-40 rounded-full hover:brightness-110"
          >
            <div className="z-10 text-center pt-2 rounded-full flex items-center justify-center text-p2 leading-none font-primary">
              SHELTER SUBMITS CAT
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
              backgroundImage: "url(/backgrounds/bg-5.png)",
              backgroundSize: "cover",
              backgroundPosition: "top",
            }}
            className="animate-brightness animate-delay-1000 md:mt-32 relative border flex flex-col items-center justify-center w-40 h-40 rounded-full hover:brightness-110"
          >
            <img
              className="w-32 h-32 pixelated -mb-8 -mt-6 -mx-6"
              src="https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/MAINE/coins/GROOMING.gif"
            />
            <div className="z-10 text-center pt-2 text-pretty rounded-full flex items-center justify-center text-p2 leading-none font-primary">
              WE TOKENIZE THE CAT
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
              backgroundImage: "url(/backgrounds/bg-night.png)",
              backgroundSize: "cover",
              backgroundPosition: "top",
            }}
            className="animate-hover animate-delay-2000 md:mt-16 relative border flex flex-col items-center justify-center w-40 h-40 rounded-full hover:brightness-110"
          >
            <div className="z-10 text-center pt-2 text-pretty rounded-full flex items-center justify-center text-p2 leading-none font-primary">
              YOU ADOPT NFT CAT
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
              backgroundImage: "url(/backgrounds/bg-6.png)",
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
              CAT GETS TREATED
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
