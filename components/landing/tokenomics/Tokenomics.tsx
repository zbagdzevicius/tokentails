export const Tokenomics = () => {
  return (
    <div className="container pb-8">
      <div className="flex justify-center items-center gap-4 md:pb-16">
        <img src="/logo/coin.png" className="w-14" />
        <h1 className="text-center font-secondary uppercase tracking-tighter text-h3 md:text-8xl">
          TOKENOMICS
        </h1>
        <img src="/logo/coin.png" className="w-14" />
      </div>
      <div className="flex flex-col md:flex-row items-center gap-8 md:gap-24">
        <div className="flex-1 min-w-0 flex justify-end items-center">
          <img width={256} src="/logo/tokenomics.png" />
        </div>
        <div className="flex-1 min-w-0 flex justify-center flex-col gap-6">
          <div>
            <span className="font-bold">TOTAL SUPPLY</span> - 1B $TTAILS
          </div>
          <div>
            <span className="font-bold">Public</span> - CEX/DEX, ICO,
            Liquidity
          </div>
          <div>
            <span className="font-bold">Rewards</span> - Prizes, staking
            rewards, earnings and airdrops
          </div>
          <div>
            <span className="font-bold">Team</span> - Engineering,
            social growth and partnerships
          </div>
        </div>
      </div>
    </div>
  );
};
