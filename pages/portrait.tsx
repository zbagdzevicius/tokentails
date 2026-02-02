"use client";

import { useState, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { UploadZone } from "@/features/portrait/components/UploadZone";
import { PortraitStyle } from "@/features/portrait/components/StylePickerDrawer";
import { AsSeenOn } from "@/features/portrait/components/AsSeenOn";
import { PreviewPage } from "@/features/portrait/components/PreviewPage";
import { Button } from "@/features/portrait/ui/button";
import { useToast } from "@/features/portrait/hooks/use-toast";
import { Toaster } from "@/features/portrait/ui/toaster";
import { trackFacebookEvent } from "@/components/FacebookPixel";
import {
  FloatingParticles,
  AmbientGlow,
  LuxuryReveal,
  SparkleEffect,
  AttentionPulse,
} from "@/features/portrait/components/LuxuryEffects";

// Import all example images for demo - using public paths
const catKing = "/portrait/example-cat-king.jpg";
const catDuchess = "/portrait/example-cat-duchess.jpg";
const catGeneral = "/portrait/example-cat-general.jpg";
const catNoble = "/portrait/example-cat-noble.jpg";
const catScholar = "/portrait/example-cat-scholar.jpg";

const PortraitPage = () => {
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [selectedStyle, setSelectedStyle] = useState<PortraitStyle>("ai");
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const { toast } = useToast();

  // Track ViewContent event on page load
  useEffect(() => {
    trackFacebookEvent("ViewContent", {
      content_name: "Royal Feline Portrait",
      content_category: "Portrait Service",
      content_ids: ["portrait"],
    });
  }, []);

  const handleImageUpload = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const imageData = e.target?.result as string;
        setUploadedImage(imageData);
        setUploadedFile(file);
        setGeneratedImages([]);
        setShowPreview(false);

        // Track AddToCart event when image is uploaded
        trackFacebookEvent("AddToCart", {
          content_name: "Royal Feline Portrait",
          content_category: "Portrait Service",
          content_ids: ["portrait"],
          value: 19.0,
          currency: "USD",
        });

        // Auto-start portrait generation
        setIsGenerating(true);
        setTimeout(() => {
          const demoVariations: Record<PortraitStyle, string> = {
            ai: [catKing, catDuchess, catGeneral][
              Math.floor(Math.random() * 3)
            ],
            king: catKing,
            duchess: catDuchess,
            general: catGeneral,
          };
          toast({
            title: "Portrait created! 👑",
            description: "Your royal masterpiece is ready.",
          });
          setGeneratedImages([demoVariations[selectedStyle]]);
          setIsGenerating(false);
          setShowPreview(true);
        }, 3000);
      };
      reader.readAsDataURL(file);
    },
    [selectedStyle, toast]
  );

  const handleClear = useCallback(() => {
    setUploadedImage(null);
    setUploadedFile(null);
    setGeneratedImages([]);
    setShowPreview(false);
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!uploadedImage) {
      toast({
        title: "No image uploaded",
        description: "Please upload a photo of your cat first.",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);

    // Simulate AI generation - generates 1 variation
    // In production, this would call Lovable AI with the uploaded image
    setTimeout(() => {
      // Demo: Use example image as the generated variation
      const demoVariations: Record<PortraitStyle, string> = {
        ai: [catKing, catDuchess, catGeneral][Math.floor(Math.random() * 3)],
        king: catKing,
        duchess: catDuchess,
        general: catGeneral,
      };

      toast({
        title: "Portrait created! 👑",
        description: "Your royal masterpiece is ready.",
      });
      setGeneratedImages([demoVariations[selectedStyle]]);
      setIsGenerating(false);
      setShowPreview(true);
    }, 3000);
  }, [uploadedImage, selectedStyle, toast]);

  const handleRetry = useCallback(() => {
    setIsGenerating(true);
    // Simulate regeneration - single variation
    setTimeout(() => {
      const allImages = [catKing, catDuchess, catGeneral, catNoble, catScholar];
      // Pick 1 random image
      const randomImage =
        allImages[Math.floor(Math.random() * allImages.length)];
      setGeneratedImages([randomImage]);
      setIsGenerating(false);
    }, 2000);
  }, []);

  const handleReset = useCallback(() => {
    setUploadedImage(null);
    setUploadedFile(null);
    setGeneratedImages([]);
    setIsGenerating(false);
    setShowPreview(false);
  }, []);

  // Show preview/purchase page after generation
  if (showPreview && generatedImages.length > 0) {
    return (
      <div className="min-h-screen bg-background" data-portrait-page="true">
        <Toaster />
        <PreviewPage
          generatedImages={generatedImages}
          onRetry={handleRetry}
          onBack={handleReset}
        />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-background texture-overlay"
      data-portrait-page="true"
    >
      <Toaster />
      {/* Hero Section - fits in viewport */}
      <main>
        <section
          id="create"
          className="relative min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center px-4 py-6 overflow-hidden"
          style={{
            background: "var(--gradient-hero)",
          }}
        >
          {/* Luxury ambient effects */}
          <FloatingParticles />
          <AmbientGlow className="w-[600px] h-[600px] -top-48 left-1/2 -translate-x-1/2" />
          <AmbientGlow className="w-[400px] h-[400px] bottom-0 -left-32" />
          <AmbientGlow className="w-[400px] h-[400px] bottom-0 -right-32" />

          {/* Progress Steps */}
          <LuxuryReveal delay={0.1}>
            <div className="flex items-center gap-3 md:gap-6 text-[10px] md:text-xs tracking-[0.15em] md:tracking-[0.2em] uppercase text-muted-foreground mb-6">
              <motion.span
                className={uploadedImage ? "text-primary" : ""}
                animate={uploadedImage ? { scale: [1, 1.1, 1] } : {}}
                transition={{ duration: 0.3 }}
              >
                Upload
              </motion.span>
              <motion.span
                className="w-6 md:w-12 h-px bg-border"
                animate={
                  uploadedImage
                    ? { backgroundColor: "hsl(var(--primary))" }
                    : {}
                }
              />
              <motion.span
                className={isGenerating ? "text-primary" : ""}
                animate={isGenerating ? { scale: [1, 1.1, 1] } : {}}
              >
                Preview
              </motion.span>
              <span className="w-6 md:w-12 h-px bg-border" />
              <span>Order</span>
            </div>
          </LuxuryReveal>

          {/* Main Heading with luxury reveal */}
          <LuxuryReveal delay={0.2} className="text-center mb-8 relative">
            <SparkleEffect />
            <motion.h1
              className="text-display text-3xl md:text-5xl mb-3 tracking-[0.12em]"
              animate={{
                textShadow: [
                  "0 0 20px hsl(var(--primary) / 0)",
                  "0 0 40px hsl(var(--primary) / 0.3)",
                  "0 0 20px hsl(var(--primary) / 0)",
                ],
              }}
              transition={{
                duration: 4,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              The Portrait
            </motion.h1>
            <motion.p
              className="text-display-italic text-2xl md:text-4xl gradient-text-gold mb-4"
              animate={{
                filter: ["brightness(1)", "brightness(1.2)", "brightness(1)"],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              Your Pet Deserves
            </motion.p>
            <p className="text-muted-foreground text-sm tracking-wider">
              Free Preview · From $29 to purchase
            </p>
          </LuxuryReveal>

          {/* Main Card with Style Picker - with attention pulse when empty */}
          <div className="relative w-full max-w-md z-10">
            {/* Attention-grabbing pulse ring around upload area */}
            {!uploadedImage && !isGenerating && <AttentionPulse />}

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="card-baroque rounded-sm p-5 relative"
            >
              {isGenerating ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center gap-4 py-8"
                >
                  <div className="relative">
                    <div className="w-16 h-16 rounded-full border-2 border-muted" />
                    <motion.div
                      className="absolute inset-0 w-16 h-16 rounded-full border-2 border-t-primary border-r-transparent border-b-transparent border-l-transparent"
                      animate={{ rotate: 360 }}
                      transition={{
                        duration: 1.5,
                        repeat: Infinity,
                        ease: "linear",
                      }}
                    />
                  </div>
                  <div className="text-center">
                    <p className="text-sm tracking-wider uppercase text-foreground">
                      Creating masterpiece
                    </p>
                    <p className="text-xs text-muted-foreground mt-2 tracking-wide">
                      This may take a moment
                    </p>
                  </div>
                </motion.div>
              ) : (
                <>
                  <UploadZone
                    onImageUpload={handleImageUpload}
                    uploadedImage={uploadedImage}
                    onClear={handleClear}
                    selectedStyle={selectedStyle}
                    onStyleChange={setSelectedStyle}
                  />

                  {uploadedImage && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className="mt-5"
                    >
                      <div className="flex justify-center">
                        <Button
                          variant="hero"
                          size="lg"
                          onClick={handleGenerate}
                          disabled={isGenerating}
                        >
                          <Sparkles className="w-4 h-4" />
                          Create Portrait
                        </Button>
                      </div>
                    </motion.div>
                  )}
                </>
              )}
            </motion.div>
          </div>

          {/* Trustpilot Badge */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="mt-6 flex flex-col items-center gap-2"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground tracking-wide">
                Excellent
              </span>
              <div className="flex items-center gap-0.5">
                {[...Array(5)].map((_, i) => (
                  <div
                    key={i}
                    className="w-4 h-4 bg-[#00b67a] flex items-center justify-center"
                  >
                    <svg
                      className="w-2.5 h-2.5 text-white fill-white"
                      viewBox="0 0 24 24"
                    >
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-1 ml-1">
                <svg
                  className="w-3 h-3 text-[#00b67a] fill-[#00b67a]"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
                <span className="text-xs font-medium tracking-wide">
                  Trustpilot
                </span>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground tracking-widest uppercase">
              #1 in Pet Portraits
            </p>
          </motion.div>

          {/* Gallery Section - clean museum style */}
          <LuxuryReveal delay={0.5} className="mt-6 w-full max-w-2xl">
            <div className="flex justify-center gap-4">
              {[catKing, catDuchess, catGeneral].map((img, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 + index * 0.15 }}
                  className="gallery-image w-24 md:w-32 aspect-[3/4] rounded-sm overflow-hidden"
                >
                  <img
                    src={img}
                    alt={`Example portrait ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                </motion.div>
              ))}
            </div>
          </LuxuryReveal>

          {/* As Seen On */}
          <div className="mt-6 w-full max-w-3xl">
            <AsSeenOn />
          </div>
        </section>
      </main>
    </div>
  );
};

export default PortraitPage;
