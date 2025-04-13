import { MarketplaceItems } from "@/components/marketplace/MarketplaceItems";
import { FirebaseAuthProvider } from "@/context/FirebaseAuthContext";
import { GameProvider } from "@/context/GameContext";
import { Footer } from "@/layouts/Footer";
import { Header } from "@/layouts/Header";

const Cats = () => {
  return (
    <FirebaseAuthProvider>
      <GameProvider>
        <div>
          <Header />
          <div
            className="pt-20 md:pt-24 fade-in min-h-screen relative flex flex-col items-center justify-center pb-16"
            style={{
              background: "url(/backgrounds/bg-night.gif)",
              backgroundAttachment: "fixed",
              backgroundSize: "cover",
              backgroundPosition: "bottom",
            }}
            id="social-farming-results"
          >
            <h2 className="text-center font-primary uppercase tracking-tight text-h6 md:text-h2 lg:text-h1 text-balance mt-3 mb-8 px-4">
              <span className="text-yellow-300 drop-shadow-[0_2.4px_1.8px_rgba(0,0,0)]">
                YOU
              </span>{" "}
              CAN SAVE A CAT
            </h2>
            <MarketplaceItems />
          </div>

          <Footer />
        </div>
      </GameProvider>
    </FirebaseAuthProvider>
  );
};

export default Cats;
