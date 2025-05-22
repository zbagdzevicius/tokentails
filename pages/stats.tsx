import Stats from "@/components/stats/Stats";
import { Footer } from "@/layouts/Footer";
import { Header } from "@/layouts/Header";

const Airdrop = () => {
  return (
    <div>
      <Header />
      <div
        className="pt-20 md:pt-24 fade-in min-h-screen relative flex flex-col items-center"
        style={{
          backgroundImage: "url(/backgrounds/bg-night.gif)",
          backgroundRepeat: "no-repeat",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
        id="stats"
      >
        <Stats />
      </div>

      <Footer />
    </div>
  );
};

export default Airdrop;
