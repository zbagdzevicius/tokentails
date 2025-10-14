import { MarketplaceItems } from "@/components/marketplace/MarketplaceItems";
import { bgStyle } from "@/constants/utils";
import { FirebaseAuthProvider } from "@/context/FirebaseAuthContext";
import { Footer } from "@/layouts/Footer";
import { Header } from "@/layouts/Header";
import { useState } from "react";

const Cats = () => {
  const [type, setType] = useState<"shelter" | "famous">("shelter");

  return (
    <FirebaseAuthProvider>
      <div>
        <Header />
        <div
          className="pt-20 md:pt-24 fade-in min-h-screen relative flex flex-col items-center justify-center pb-16"
          style={bgStyle("6")}
          id="social-farming-results"
        >
          <h2 className="text-center font-primary uppercase tracking-tight text-h6 md:text-h2 lg:text-h1 text-balance mt-3 px-4">
            <span className="text-yellow-300 drop-shadow-[0_2.4px_1.8px_rgba(0,0,0)]">
              ADOPT
            </span>{" "}
            COLLECTIBLE CAT
          </h2>
          <MarketplaceItems type={type} setType={setType} />
        </div>

        <Footer />
      </div>
    </FirebaseAuthProvider>
  );
};

export default Cats;
