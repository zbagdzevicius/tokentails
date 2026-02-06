"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/router";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { UploadZone } from "@/features/portrait/components/UploadZone";
import { PortraitStyle } from "@/features/portrait/components/StylePickerDrawer";
import { AsSeenOn } from "@/features/portrait/components/AsSeenOn";
import {
  PreviewPage,
  purchaseOptions,
} from "@/features/portrait/components/PreviewPage";
import { Button } from "@/features/portrait/ui/button";
import { useToast } from "@/features/portrait/hooks/use-toast";
import { Toaster } from "@/features/portrait/ui/toaster";
import { trackEvent } from "@/components/GoogleTagManager";
import { IMAGE_API } from "@/api/image-api";
import { IImage } from "@/models/image";
import { IOrder, OrderStatus } from "@/models/order";
import {
  FloatingParticles,
  AmbientGlow,
  LuxuryReveal,
  SparkleEffect,
  AttentionPulse,
} from "@/features/portrait/components/LuxuryEffects";

// Import all example images for demo - using public paths
const catKing = "/portrait/cat-example.webp";
const catDuchess = "/portrait/portrait-dogs.webp";
const catGeneral = "/portrait/portrait-monarch.webp";

const PortraitPage = () => {
  const router = useRouter();
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [selectedStyle, setSelectedStyle] = useState<PortraitStyle>("ai");
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [eventId, setEventId] = useState<string | undefined>(undefined);
  const [uploadedImageId, setUploadedImageId] = useState<string | undefined>(
    undefined
  );
  const [orderStatus, setOrderStatus] = useState<OrderStatus | null>(null);
  const [isPollingOrder, setIsPollingOrder] = useState(false);
  const [orderProductType, setOrderProductType] = useState<string | null>(null);
  const { toast } = useToast();

  // Poll order status
  const pollOrderStatus = useCallback(
    (sessionId: string, imageId: string) => {
      let pollInterval: NodeJS.Timeout;
      let timeoutId: NodeJS.Timeout;

      pollInterval = setInterval(async () => {
        try {
          const order: IOrder | null = await IMAGE_API.getOrderById(sessionId);

          if (order) {
            if (order.status === OrderStatus.COMPLETE) {
              setOrderStatus(OrderStatus.COMPLETE);
              setOrderProductType(order.id || null); // id is productType
              setIsPollingOrder(false);
              clearInterval(pollInterval);
              if (timeoutId) clearTimeout(timeoutId);

              // Track Purchase event after successful verification
              trackEvent("purchase", {
                event_id: imageId,
                transaction_id: sessionId,
                item_id: order.id || "unknown",
                item_name: order.id || "unknown",
                value: order.price || 0,
                currency: "USD",
              });
            } else if (order.status === OrderStatus.FAILED) {
              setOrderStatus(OrderStatus.FAILED);
              setIsPollingOrder(false);
              clearInterval(pollInterval);
              if (timeoutId) clearTimeout(timeoutId);
              toast({
                title: "Order failed",
                description: "Your payment could not be processed.",
                variant: "destructive",
              });
            }
            // If PENDING, continue polling
          }
        } catch (error) {
          console.error("Error polling order status:", error);
          // Continue polling on error
        }
      }, 2000); // Poll every 2 seconds

      // Cleanup interval after 5 minutes (max polling time)
      timeoutId = setTimeout(() => {
        clearInterval(pollInterval);
        setIsPollingOrder((prev) => {
          if (prev) {
            toast({
              title: "Order status check timeout",
              description:
                "Please refresh the page to check your order status.",
              variant: "destructive",
            });
          }
          return false;
        });
      }, 5 * 60 * 1000);

      return () => {
        clearInterval(pollInterval);
        if (timeoutId) clearTimeout(timeoutId);
      };
    },
    [toast]
  );

  // Check for image_id and session_id query params
  useEffect(() => {
    const { image_id, session_id } = router.query;

    // If both image_id and session_id exist, fetch image and poll order status
    if (
      image_id &&
      typeof image_id === "string" &&
      session_id &&
      typeof session_id === "string"
    ) {
      setUploadedImageId(image_id);
      setEventId(image_id);
      setIsGenerating(true);
      setIsPollingOrder(true);

      // Fetch existing image from API
      IMAGE_API.get(image_id)
        .then((image: IImage | null) => {
          if (image) {
            const imageUrl = image.aiUrl || image.url;
            if (imageUrl) {
              setGeneratedImages([imageUrl]);
              setShowPreview(true);
              setIsGenerating(false);

              // Start polling for order status
              pollOrderStatus(session_id, image_id);
            } else {
              throw new Error("No image URL in response");
            }
          } else {
            throw new Error("Failed to fetch image");
          }
        })
        .catch((error) => {
          console.error("Error fetching image:", error);
          toast({
            title: "Failed to load image",
            description: "Please try again or upload a new image.",
            variant: "destructive",
          });
          setIsGenerating(false);
          setIsPollingOrder(false);
          // Remove invalid image_id from URL
          const { image_id: _, ...restQuery } = router.query;
          router.replace(
            {
              pathname: router.pathname,
              query: restQuery,
            },
            undefined,
            { shallow: true }
          );
        });
    } else if (image_id && typeof image_id === "string") {
      // Only image_id exists, fetch image without polling
      setUploadedImageId(image_id);
      setEventId(image_id);
      setIsGenerating(true);

      // Fetch existing image from API
      IMAGE_API.get(image_id)
        .then((image: IImage | null) => {
          if (image) {
            const imageUrl = image.aiUrl || image.url;
            if (imageUrl) {
              setGeneratedImages([imageUrl]);
              setShowPreview(true);
              setIsGenerating(false);
            } else {
              throw new Error("No image URL in response");
            }
          } else {
            throw new Error("Failed to fetch image");
          }
        })
        .catch((error) => {
          console.error("Error fetching image:", error);
          toast({
            title: "Failed to load image",
            description: "Please try again or upload a new image.",
            variant: "destructive",
          });
          setIsGenerating(false);
          // Remove invalid image_id from URL
          const { image_id: _, ...restQuery } = router.query;
          router.replace(
            {
              pathname: router.pathname,
              query: restQuery,
            },
            undefined,
            { shallow: true }
          );
        });
    }
  }, [router.query, toast, router, pollOrderStatus]);

  // Add data attribute to body and html so drawer portal can access CSS variables
  useEffect(() => {
    document.body.setAttribute("data-portrait-page", "true");
    document.documentElement.setAttribute("data-portrait-page", "true");
    return () => {
      document.body.removeAttribute("data-portrait-page");
      document.documentElement.removeAttribute("data-portrait-page");
    };
  }, []);

  const handleImageUpload = useCallback(
    async (file: File) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const imageData = e.target?.result as string;
        setUploadedImage(imageData);
        setUploadedFile(file);
        setGeneratedImages([]);
        setShowPreview(false);

        // Use first purchase option as default
        const defaultOption = purchaseOptions[0];
        trackEvent("view_item", {
          item_name: defaultOption.id,
          item_category: "portrait",
          item_id: defaultOption.id,
          value: defaultOption.price,
          currency: "USD",
        });

        // Upload image and generate portrait
        setIsGenerating(true);
        try {
          const uploadedImage: IImage | null = await IMAGE_API.uploadImage(
            file,
            {
              name: file.name,
            }
          );

          if (uploadedImage && uploadedImage._id) {
            setUploadedImageId(uploadedImage._id);
            // Update URL with image_id
            router.replace(
              {
                pathname: router.pathname,
                query: { ...router.query, image_id: uploadedImage._id },
              },
              undefined,
              { shallow: true }
            );
            // Use the AI-generated URL if available, otherwise use the regular URL
            const imageUrl = uploadedImage.aiUrl || uploadedImage.url;
            if (imageUrl) {
              toast({
                title: "Portrait created! 👑",
                description: "Your royal masterpiece is ready.",
              });
              setGeneratedImages([imageUrl]);
              setIsGenerating(false);
              setShowPreview(true);
            } else {
              throw new Error("No image URL returned");
            }
          } else {
            throw new Error("Failed to upload image");
          }
        } catch (error) {
          console.error("Error uploading image:", error);
          toast({
            title: "Upload failed",
            description: "Please try again.",
            variant: "destructive",
          });
          setIsGenerating(false);
        }
      };
      reader.readAsDataURL(file);
    },
    [toast]
  );

  const handleClear = useCallback(() => {
    setUploadedImage(null);
    setUploadedFile(null);
    setGeneratedImages([]);
    setShowPreview(false);
    setUploadedImageId(undefined);
    // Remove image_id from URL
    const { image_id, ...restQuery } = router.query;
    router.replace(
      {
        pathname: router.pathname,
        query: restQuery,
      },
      undefined,
      { shallow: true }
    );
  }, [router]);

  const handleGenerate = useCallback(async () => {
    if (!uploadedFile) {
      toast({
        title: "No image uploaded",
        description: "Please upload a photo of your cat first.",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);

    try {
      const uploadedImage: IImage | null = await IMAGE_API.uploadImage(
        uploadedFile,
        {
          name: uploadedFile.name,
        }
      );

      if (uploadedImage && uploadedImage._id) {
        setUploadedImageId(uploadedImage._id);
        // Update URL with image_id
        router.replace(
          {
            pathname: router.pathname,
            query: { ...router.query, image_id: uploadedImage._id },
          },
          undefined,
          { shallow: true }
        );
        const imageUrl = uploadedImage.aiUrl || uploadedImage.url;
        if (imageUrl) {
          toast({
            title: "Portrait created! 👑",
            description: "Your royal masterpiece is ready.",
          });
          setGeneratedImages([imageUrl]);
          setIsGenerating(false);
          setShowPreview(true);
        } else {
          throw new Error("No image URL returned");
        }
      } else {
        throw new Error("Failed to generate portrait");
      }
    } catch (error) {
      console.error("Error generating portrait:", error);
      toast({
        title: "Generation failed",
        description: "Please try again.",
        variant: "destructive",
      });
      setIsGenerating(false);
    }
  }, [uploadedFile, toast]);

  const handleRetry = useCallback(async () => {
    if (!uploadedImageId) {
      toast({
        title: "No image to regenerate",
        description: "Please upload an image first.",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    try {
      const regeneratedImage: IImage | null =
        await IMAGE_API.regeneratePortrait(uploadedImageId);

      if (regeneratedImage) {
        const imageUrl = regeneratedImage.aiUrl || regeneratedImage.url;
        if (imageUrl) {
          setGeneratedImages([imageUrl]);
          setIsGenerating(false);
        } else {
          throw new Error("No image URL returned");
        }
      } else {
        throw new Error("Failed to regenerate portrait");
      }
    } catch (error) {
      console.error("Error regenerating portrait:", error);
      toast({
        title: "Regeneration failed",
        description: "Please try again.",
        variant: "destructive",
      });
      setIsGenerating(false);
    }
  }, [uploadedImageId, toast]);

  const handleReset = useCallback(() => {
    setUploadedImage(null);
    setUploadedFile(null);
    setGeneratedImages([]);
    setIsGenerating(false);
    setShowPreview(false);
    setUploadedImageId(undefined);
    // Remove image_id from URL
    const { image_id, ...restQuery } = router.query;
    router.replace(
      {
        pathname: router.pathname,
        query: restQuery,
      },
      undefined,
      { shallow: true }
    );
  }, [router]);

  // Show preview/purchase page after generation
  if (showPreview && generatedImages.length > 0) {
    return (
      <div className="min-h-screen bg-background" data-portrait-page="true">
        <Toaster />
        <PreviewPage
          generatedImages={generatedImages}
          onRetry={handleRetry}
          onBack={handleReset}
          eventId={eventId}
          imageId={uploadedImageId}
          orderStatus={orderStatus}
          isPollingOrder={isPollingOrder}
          orderProductType={orderProductType}
          sessionId={router.query.session_id as string | undefined}
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
