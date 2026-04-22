import { useState } from "react";
import { AboutUsModal } from "./AboutUsModal";
import { PoliciesModal } from "./PoliciesModal";
import { SupportModal } from "./SupportModal";

export const PortraitFooter = () => {
  const [aboutUsOpen, setAboutUsOpen] = useState(false);
  const [policiesOpen, setPoliciesOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);

  return (
    <>
      <footer className="w-full border-t border-border bg-background/95 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-8">
            <button
              onClick={() => setAboutUsOpen(true)}
              className="text-xs md:text-sm text-muted-foreground hover:text-foreground transition-colors uppercase tracking-wider"
            >
              About Us
            </button>
            <span className="hidden md:inline text-muted-foreground">•</span>
            <button
              onClick={() => setPoliciesOpen(true)}
              className="text-xs md:text-sm text-muted-foreground hover:text-foreground transition-colors uppercase tracking-wider"
            >
              Policies
            </button>
            <span className="hidden md:inline text-muted-foreground">•</span>
            <button
              onClick={() => setSupportOpen(true)}
              className="text-xs md:text-sm text-muted-foreground hover:text-foreground transition-colors uppercase tracking-wider"
            >
              Support
            </button>
          </div>
          <div className="mt-4 text-center">
            <p className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} Token Tails. All rights reserved.
            </p>
          </div>
        </div>
      </footer>

      <AboutUsModal open={aboutUsOpen} onOpenChange={setAboutUsOpen} />
      <PoliciesModal open={policiesOpen} onOpenChange={setPoliciesOpen} />
      <SupportModal open={supportOpen} onOpenChange={setSupportOpen} />
    </>
  );
};
