import { MarketplaceItems } from "@/components/marketplace/MarketplaceItems";
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
          style={{
            background: "url(/backgrounds/bg-night.gif)",
            backgroundAttachment: "fixed",
            backgroundSize: "cover",
            backgroundPosition: "bottom",
          }}
          id="social-farming-results"
        >
          <h2 className="text-center font-primary uppercase tracking-tight text-h6 md:text-h2 lg:text-h1 text-balance mt-3 px-4">
            <span className="text-yellow-300 drop-shadow-[0_2.4px_1.8px_rgba(0,0,0)]">
              YOU
            </span>{" "}
            {type === "shelter" ? "CAN SAVE A CAT" : "CAN HELP A CAT"}
          </h2>
          <h3 className="text-center font-primary uppercase tracking-tight text-p5 md:text-p4 lg:text-p3 text-balance mb-2 px-4">
            {type === "shelter"
              ? "100% OF YOUR DONATIONS GO TO THESE CATS"
              : "100% OF YOUR DONATIONS GO TO SHELTERS"}
          </h3>
          <MarketplaceItems type={type} setType={setType} />
        </div>

        <Footer />
      </div>
    </FirebaseAuthProvider>
  );
};

export default Cats;
