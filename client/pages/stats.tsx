import Stats from "@/components/stats/Stats";
import { SeoHead } from "@/components/seo/SeoHead";
import { bgStyle } from "@/constants/utils";
import { Footer } from "@/layouts/Footer";
import { Header } from "@/layouts/Header";

const StatsPage = () => {
  return (
    <div>
      <SeoHead
        title="Token Tails - Stats"
        description="Token Tails numbers from the hourly impact snapshot, each with its date and source."
        path="/stats"
      />
      <Header />
      <div
        className="pt-20 md:pt-24 fade-in min-h-screen relative flex flex-col items-center bg-tt-night-900"
        style={bgStyle("6")}
        id="stats"
      >
        <Stats />
      </div>

      <Footer />
    </div>
  );
};

export default StatsPage;
