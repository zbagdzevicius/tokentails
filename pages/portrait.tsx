"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Check,
  Menu,
  Minus,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { cdnFile } from "@/constants/utils";
import { UploadZone } from "@/features/portrait/components/UploadZone";
import { PortraitStyle } from "@/features/portrait/components/StylePickerDrawer";
import { AsSeenOn } from "@/features/portrait/components/AsSeenOn";
import { PortraitFooter } from "@/features/portrait/components/PortraitFooter";
import {
  PreviewPage,
  purchaseOptions,
} from "@/features/portrait/components/PreviewPage";
import { useToast } from "@/features/portrait/hooks/use-toast";
import { Toaster } from "@/features/portrait/ui/toaster";
import { trackEvent } from "@/components/GoogleTagManager";
import { IMAGE_API } from "@/api/image-api";
import { IImage } from "@/models/image";
import { IOrder, OrderStatus } from "@/models/order";

const HERO_WORDS = [
  "Cat 🐱",
  "Kitten 🐾",
  "Rescue Cat 🧡",
  "Chonky Cat 🍞",
  "Bestie 😺",
];

const FLOATING_EMOJIS = ["🐾", "✨", "👑", "🎨", "💖"];
const CANVAS_VIDEO_URL =
  "https://tokentails.fra1.cdn.digitaloceanspaces.com/pet.mp4";

const DISPLAY_FONT = "'Space Grotesk', 'Bebas Neue', sans-serif";
const BODY_FONT = "'Plus Jakarta Sans', 'Nunito', sans-serif";

const getStyleImages = (style: PortraitStyle): string[] => {
  return [
    `/portrait/${style}-1.webp`,
    `/portrait/${style}-2.webp`,
    `/portrait/${style}-3.webp`,
  ];
};

const STYLE_LABELS: Record<PortraitStyle, string> = {
  [PortraitStyle.HIGHNESS]: "Highness",
  [PortraitStyle.MONARCH]: "Monarch",
  [PortraitStyle.ARISTOCRAT]: "Aristocrat",
  [PortraitStyle.COMMANDER]: "Commander",
};

const STATS = [
  { emoji: "🖼️", value: "50K+", label: "Portraits generated", bg: "#fff0e3" },
  { emoji: "⭐", value: "4.9/5", label: "Happy cat parents", bg: "#e8f9f0" },
  { emoji: "⚡", value: "< 2 min", label: "Average generation", bg: "#f1ebff" },
  { emoji: "🌍", value: "120+", label: "Countries served", bg: "#fff9db" },
];

const HOW_IT_WORKS = [
  {
    num: "01",
    emoji: "📸",
    title: "Upload your cat",
    desc: "Use a clear photo. Front-facing shots usually give the best results.",
    image: "/portrait/highness-1.webp",
    bg: "#fff0e3",
  },
  {
    num: "02",
    emoji: "🎭",
    title: "Pick a royal style",
    desc: "Switch between Highness, Monarch, Aristocrat, and Commander styles.",
    image: "/portrait/monarch-1.webp",
    bg: "#e8f9f0",
  },
  {
    num: "03",
    emoji: "👑",
    title: "Get the masterpiece",
    desc: "Preview in seconds, regenerate if needed, then order digital, print, or canvas.",
    image: "/portrait/aristocrat-1.webp",
    bg: "#f1ebff",
  },
];

const GALLERY_ITEMS = [
  {
    src: "/portrait/highness-1.webp",
    title: "The Empress 👸",
    style: "Highness",
    bg: "#fff0e3",
  },
  {
    src: "/portrait/monarch-1.webp",
    title: "The General 🎖️",
    style: "Monarch",
    bg: "#e8f9f0",
  },
  {
    src: "/portrait/aristocrat-1.webp",
    title: "The Duchess 💎",
    style: "Aristocrat",
    bg: "#f1ebff",
  },
  {
    src: "/portrait/commander-1.webp",
    title: "The Captain ⚔️",
    style: "Commander",
    bg: "#fff9db",
  },
  {
    src: "/portrait/highness-2.webp",
    title: "The Queen 👑",
    style: "Highness",
    bg: "#fff0e3",
  },
  {
    src: "/portrait/monarch-2.webp",
    title: "The Duke 🎩",
    style: "Monarch",
    bg: "#e8f9f0",
  },
  {
    src: "/portrait/aristocrat-2.webp",
    title: "The Scholar 📚",
    style: "Aristocrat",
    bg: "#f1ebff",
  },
  {
    src: "/portrait/commander-2.webp",
    title: "The Protector 🛡️",
    style: "Commander",
    bg: "#fff9db",
  },
  {
    src: "/portrait/highness-3.webp",
    title: "The Royal Icon ✨",
    style: "Highness",
    bg: "#fff0e3",
  },
];

const TESTIMONIALS = [
  {
    name: "Sarah M.",
    handle: "@catmom_sarah",
    text: "My rescue cat looks unreal. We printed it and everyone asks where it came from.",
    avatar: "🐱",
    bg: "#fff0e3",
    rotate: -2,
  },
  {
    name: "Lukas T.",
    handle: "@lukastails",
    text: "Honestly expected something basic. Got a portrait that looks gallery-level.",
    avatar: "🎨",
    bg: "#e8f9f0",
    rotate: 1,
  },
  {
    name: "Emily R.",
    handle: "@emilycats",
    text: "Generation is super fast and the style variations are actually different.",
    avatar: "⚡",
    bg: "#f1ebff",
    rotate: -1,
  },
  {
    name: "Marcus D.",
    handle: "@marcuspets",
    text: "Best 5 impulse purchase. Ended up ordering canvas right after.",
    avatar: "🖼️",
    bg: "#fff9db",
    rotate: 2,
  },
];

const FAQS = [
  {
    q: "How fast is a portrait generated?",
    a: "Usually in under 2 minutes. During peak traffic, it can take a little longer.",
  },
  {
    q: "What photo works best?",
    a: "Use a clear and well-lit photo. Front-facing cat photos generally perform best.",
  },
  {
    q: "Can I regenerate if I want another style?",
    a: "Yes. You can regenerate and rotate through available styles from the preview flow.",
  },
  {
    q: "Do I get high-resolution output?",
    a: "Yes. Digital portraits are delivered in high resolution and are suitable for print.",
  },
  {
    q: "Can I order physical products too?",
    a: "Yes. You can order print or canvas options in addition to the digital version.",
  },
  {
    q: "Do you offer refunds?",
    a: "If there is a system issue or you are not satisfied, support can help with a resolution.",
  },
];

const DEMO_STEPS = [
  {
    step: 1,
    label: "Upload cat photo 📸",
    desc: "Any clear photo works",
  },
  {
    step: 2,
    label: "Choose style 🎭",
    desc: "Highness, Monarch, Aristocrat, Commander",
  },
  {
    step: 3,
    label: "Get result 👑",
    desc: "Preview and purchase",
  },
];

const DEMO_RESULT_IMAGES = [
  "/portrait/highness-1.webp",
  "/portrait/monarch-1.webp",
  "/portrait/aristocrat-1.webp",
  "/portrait/commander-1.webp",
];

const getProgressMessage = (percentage: number): string => {
  if (percentage < 10) return "Sniffing out whiskers...";
  if (percentage < 20) return "Finding the fluffiest details...";
  if (percentage < 30) return "Matching a royal style...";
  if (percentage < 40) return "Sketching the frame...";
  if (percentage < 50) return "Painting the first pass...";
  if (percentage < 60) return "Adding noble details...";
  if (percentage < 70) return "Enhancing fur texture...";
  if (percentage < 80) return "Polishing the portrait...";
  if (percentage < 90) return "Applying final glam...";
  if (percentage < 95) return "Almost there...";
  return "Preparing reveal...";
};

const PortraitsPage = () => {
  const router = useRouter();
  const { toast } = useToast();

  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [selectedStyle, setSelectedStyle] = useState<PortraitStyle>(
    PortraitStyle.HIGHNESS,
  );
  const [currentImageStyle, setCurrentImageStyle] = useState<PortraitStyle>(
    PortraitStyle.HIGHNESS,
  );
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [eventId, setEventId] = useState<string | undefined>(undefined);
  const [uploadedImageId, setUploadedImageId] = useState<string | undefined>(
    undefined,
  );
  const [orderStatus, setOrderStatus] = useState<OrderStatus | null>(null);
  const [isPollingOrder, setIsPollingOrder] = useState(false);
  const [orderProductType, setOrderProductType] = useState<string | null>(null);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationMessage, setGenerationMessage] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [heroWordIndex, setHeroWordIndex] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeDemoStep, setActiveDemoStep] = useState(0);
  const [activeFaq, setActiveFaq] = useState<number | null>(null);

  const styleRotation = useMemo(
    () => [
      PortraitStyle.HIGHNESS,
      PortraitStyle.MONARCH,
      PortraitStyle.ARISTOCRAT,
      PortraitStyle.COMMANDER,
    ],
    [],
  );

  const pollCleanupRef = useRef<(() => void) | null>(null);
  const revealTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastProcessedQueryRef = useRef<string>("");

  const clearPolling = useCallback(() => {
    if (pollCleanupRef.current) {
      pollCleanupRef.current();
      pollCleanupRef.current = null;
    }
  }, []);

  const clearRevealTimeout = useCallback(() => {
    if (revealTimeoutRef.current) {
      clearTimeout(revealTimeoutRef.current);
      revealTimeoutRef.current = null;
    }
  }, []);

  const stripPreviewQueryFromUrl = useCallback(() => {
    const nextQuery = { ...router.query };
    delete nextQuery.image_id;
    delete nextQuery._id;
    router.replace(
      {
        pathname: router.pathname,
        query: nextQuery,
      },
      undefined,
      { shallow: true },
    );
  }, [router]);

  useEffect(() => {
    return () => {
      clearPolling();
      clearRevealTimeout();
    };
  }, [clearPolling, clearRevealTimeout]);

  useEffect(() => {
    const wordTimer = setInterval(() => {
      setHeroWordIndex((prev) => (prev + 1) % HERO_WORDS.length);
    }, 1800);
    return () => clearInterval(wordTimer);
  }, []);

  useEffect(() => {
    const demoTimer = setInterval(() => {
      setActiveDemoStep((prev) => (prev + 1) % DEMO_STEPS.length);
    }, 2500);
    return () => clearInterval(demoTimer);
  }, []);

  useEffect(() => {
    if (!isGenerating) {
      setGenerationProgress(0);
      setGenerationMessage("");
      return;
    }

    const startTime = Date.now();
    const maxDurationMs = 60000;
    let rafId = 0;

    const update = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min((elapsed / maxDurationMs) * 100, 99);
      setGenerationProgress(progress);
      setGenerationMessage(getProgressMessage(progress));

      if (progress < 99) {
        rafId = requestAnimationFrame(update);
      }
    };

    rafId = requestAnimationFrame(update);

    return () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [isGenerating]);

  useEffect(() => {
    document.body.setAttribute("data-portrait-page", "true");
    document.documentElement.setAttribute("data-portrait-page", "true");
    document.body.setAttribute("data-portrait-variant", "playful");
    document.documentElement.setAttribute("data-portrait-variant", "playful");
    return () => {
      document.body.removeAttribute("data-portrait-variant");
      document.documentElement.removeAttribute("data-portrait-variant");
      document.body.removeAttribute("data-portrait-page");
      document.documentElement.removeAttribute("data-portrait-page");
    };
  }, []);

  const pollOrderStatus = useCallback(
    (orderId: string, imageId: string) => {
      clearPolling();
      setIsPollingOrder(true);

      const pollInterval = setInterval(async () => {
        try {
          const order: IOrder | null = await IMAGE_API.getOrderById(orderId);
          if (!order) {
            return;
          }

          if (order.status === OrderStatus.COMPLETE) {
            setOrderStatus(OrderStatus.COMPLETE);
            setOrderProductType(order.id || null);
            setIsPollingOrder(false);
            clearInterval(pollInterval);
            clearTimeout(timeoutId);

            trackEvent("purchase", {
              event_id: imageId,
              transaction_id: orderId,
              item_id: order.id || "unknown",
              item_name: order.id || "unknown",
              value: order.price || 0,
              currency: "USD",
            });
          } else if (order.status === OrderStatus.FAILED) {
            setOrderStatus(OrderStatus.FAILED);
            setIsPollingOrder(false);
            clearInterval(pollInterval);
            clearTimeout(timeoutId);

            toast({
              title: "Order failed",
              description: "Your payment could not be processed.",
              variant: "destructive",
            });
          }
        } catch (error) {
          console.error("Error polling order status:", error);
        }
      }, 2000);

      const timeoutId = setTimeout(() => {
        clearInterval(pollInterval);
        setIsPollingOrder((current) => {
          if (current) {
            toast({
              title: "Order status timeout",
              description: "Please refresh the page to check payment status.",
              variant: "destructive",
            });
          }
          return false;
        });
      }, 5 * 60 * 1000);

      const cleanup = () => {
        clearInterval(pollInterval);
        clearTimeout(timeoutId);
      };

      pollCleanupRef.current = cleanup;
      return cleanup;
    },
    [clearPolling, toast],
  );

  useEffect(() => {
    if (!router.isReady) {
      return;
    }

    const imageId =
      typeof router.query.image_id === "string" ? router.query.image_id : "";
    const orderId =
      typeof router.query._id === "string" ? router.query._id : "";
    const querySignature = `${imageId}::${orderId}`;

    if (lastProcessedQueryRef.current === querySignature) {
      return;
    }
    lastProcessedQueryRef.current = querySignature;

    if (!imageId) {
      return;
    }

    let cancelled = false;

    setUploadedImageId(imageId);
    setEventId(imageId);
    setIsGenerating(true);
    setOrderStatus(null);
    setIsPollingOrder(Boolean(orderId));

    IMAGE_API.get(imageId)
      .then((image: IImage | null) => {
        if (cancelled) {
          return;
        }

        if (!image) {
          throw new Error("Image not found");
        }

        const imageUrl = image.aiUrl || image.url;
        if (!imageUrl) {
          throw new Error("No image URL returned");
        }

        setGeneratedImages([imageUrl]);
        setCurrentImageStyle(
          ((image as IImage & { style?: PortraitStyle })
            .style as PortraitStyle) || PortraitStyle.HIGHNESS,
        );
        setShowPreview(true);
        setIsGenerating(false);

        if (orderId) {
          pollOrderStatus(orderId, imageId);
        }
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        console.error("Error restoring portrait from URL:", error);
        toast({
          title: "Failed to load portrait",
          description: "Please upload your cat again.",
          variant: "destructive",
        });

        setIsGenerating(false);
        setIsPollingOrder(false);
        stripPreviewQueryFromUrl();
      });

    return () => {
      cancelled = true;
    };
  }, [
    pollOrderStatus,
    router.isReady,
    router.query._id,
    router.query.image_id,
    stripPreviewQueryFromUrl,
    toast,
  ]);

  const runPortraitGeneration = useCallback(
    async (file: File, style: PortraitStyle) => {
      clearRevealTimeout();
      clearPolling();

      setIsGenerating(true);
      setShowPreview(false);
      setGeneratedImages([]);
      setOrderStatus(null);
      setIsPollingOrder(false);
      setOrderProductType(null);

      try {
        const generated: IImage | null = await IMAGE_API.generatePortrait(
          file,
          {
            name: file.name,
            style,
          },
        );

        if (!generated || !generated._id) {
          throw new Error("Generation failed");
        }

        const imageUrl = generated.aiUrl || generated.url;
        if (!imageUrl) {
          throw new Error("Missing generated image URL");
        }

        setUploadedImageId(generated._id);
        setEventId(generated._id);
        setCurrentImageStyle(style);
        setGenerationProgress(100);
        setGenerationMessage("Complete!");

        const nextQuery: Record<string, string | string[] | undefined> = {
          ...(router.query as Record<string, string | string[] | undefined>),
          image_id: generated._id,
        };
        delete nextQuery._id;
        router.replace(
          {
            pathname: router.pathname,
            query: nextQuery,
          },
          undefined,
          { shallow: true },
        );

        revealTimeoutRef.current = setTimeout(() => {
          toast({
            title: "Portrait created! 👑",
            description: "Your masterpiece is ready.",
          });
          setGeneratedImages([imageUrl]);
          setShowPreview(true);
          setIsGenerating(false);
        }, 450);
      } catch (error) {
        console.error("Error generating portrait:", error);
        toast({
          title: "Generation failed",
          description: "Please try again.",
          variant: "destructive",
        });
        setIsGenerating(false);
      }
    },
    [clearPolling, clearRevealTimeout, router, toast],
  );

  const handleImageUpload = useCallback(
    async (file: File) => {
      const reader = new FileReader();

      reader.onload = () => {
        const imageData = reader.result as string;
        setUploadedImage(imageData);
        setUploadedFile(file);
        setShowPreview(false);
        setGeneratedImages([]);

        const defaultOption = purchaseOptions[0];
        trackEvent("view_item", {
          item_name: defaultOption.id,
          item_category: "portrait",
          item_id: defaultOption.id,
          value: defaultOption.price,
          currency: "USD",
        });

        void runPortraitGeneration(file, selectedStyle);
      };

      reader.readAsDataURL(file);
    },
    [runPortraitGeneration, selectedStyle],
  );

  const resetToUploadState = useCallback(() => {
    clearPolling();
    clearRevealTimeout();
    setUploadedImage(null);
    setUploadedFile(null);
    setGeneratedImages([]);
    setIsGenerating(false);
    setShowPreview(false);
    setUploadedImageId(undefined);
    setEventId(undefined);
    setOrderStatus(null);
    setIsPollingOrder(false);
    setOrderProductType(null);
    stripPreviewQueryFromUrl();
  }, [clearPolling, clearRevealTimeout, stripPreviewQueryFromUrl]);

  const handleClear = useCallback(() => {
    resetToUploadState();
  }, [resetToUploadState]);

  const handleGenerate = useCallback(async () => {
    if (!uploadedFile) {
      toast({
        title: "No image uploaded",
        description: "Please upload a photo first.",
        variant: "destructive",
      });
      return;
    }

    await runPortraitGeneration(uploadedFile, selectedStyle);
  }, [runPortraitGeneration, selectedStyle, toast, uploadedFile]);

  const handleRetry = useCallback(async () => {
    if (!uploadedImageId) {
      toast({
        title: "No image found",
        description: "Please upload an image first.",
        variant: "destructive",
      });
      return;
    }

    clearRevealTimeout();
    setIsGenerating(true);

    try {
      const currentIndex = styleRotation.indexOf(currentImageStyle);
      const nextIndex =
        currentIndex === styleRotation.length - 1 ? 0 : currentIndex + 1;
      const nextStyle = styleRotation[nextIndex];
      setCurrentImageStyle(nextStyle);

      const regenerated = await IMAGE_API.regeneratePortrait(
        uploadedImageId,
        nextStyle,
      );
      const imageUrl = regenerated?.aiUrl || regenerated?.url;

      if (!imageUrl) {
        throw new Error("Regeneration failed");
      }

      setGeneratedImages([imageUrl]);
      setIsGenerating(false);
    } catch (error) {
      console.error("Error regenerating portrait:", error);
      toast({
        title: "Regeneration failed",
        description: "Please try again.",
        variant: "destructive",
      });
      setIsGenerating(false);
    }
  }, [
    clearRevealTimeout,
    currentImageStyle,
    styleRotation,
    toast,
    uploadedImageId,
  ]);

  const handleReset = useCallback(() => {
    resetToUploadState();
  }, [resetToUploadState]);

  const handleScrollToCreate = useCallback(
    (itemId?: string, price?: number) => {
      if (itemId) {
        trackEvent("view_item", {
          item_id: itemId,
          item_name: itemId,
          item_category: "portrait",
          value: price || 0,
          currency: "USD",
        });
      }

      const target = document.getElementById("create");
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    },
    [],
  );

  const demoResultImage =
    DEMO_RESULT_IMAGES[heroWordIndex % DEMO_RESULT_IMAGES.length];

  if (showPreview && generatedImages.length > 0) {
    return (
      <>
        <Head>
          <title>Immortalize Your Pet in a Timeless Portrait</title>
          <meta
            property="og:image"
            content={`${
              process.env.NEXT_PUBLIC_DOMAIN ||
              (typeof window !== "undefined" ? window.location.origin : "")
            }/portrait/portrait-ogg.webp`}
          />
          <meta
            property="og:title"
            content="Immortalize Your Pet in a Timeless Portrait"
            key="title"
          />
          <meta
            name="description"
            content="Create a stunning royal portrait of your beloved pet. Transform your pet into a timeless masterpiece with our AI-powered portrait service."
          />
          <link rel="shortcut icon" href={cdnFile("logo/logo.webp")} />
        </Head>
        <div className="min-h-screen bg-background">
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
            orderId={router.query._id as string | undefined}
            blurHalf={orderStatus !== OrderStatus.COMPLETE}
            showWatermark={false}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Immortalize Your Pet in a Timeless Portrait</title>
        <meta
          property="og:image"
          content={`${
            process.env.NEXT_PUBLIC_DOMAIN ||
            (typeof window !== "undefined" ? window.location.origin : "")
          }/portrait/portrait-ogg.webp`}
        />
        <meta
          property="og:title"
          content="Immortalize Your Pet in a Timeless Portrait"
          key="title"
        />
        <meta
          name="description"
          content="Create a stunning royal portrait of your beloved pet. Transform your pet into a timeless masterpiece with our AI-powered portrait service."
        />
        <link rel="shortcut icon" href={cdnFile("logo/logo.webp")} />
      </Head>

      <div
        className="min-h-screen bg-[#fffef9] text-[#101014] overflow-x-hidden"
        style={{ fontFamily: BODY_FONT }}
      >
        <Toaster />

        <div className="bg-[linear-gradient(135deg,#ff7b5a,#ffa947)] px-4 py-2.5 text-center">
          <p className="text-sm font-semibold text-white flex items-center justify-center gap-2">
            <motion.span
              animate={{ rotate: [0, 18, -18, 0] }}
              transition={{ duration: 1.4, repeat: Infinity }}
            >
              🐾
            </motion.span>
            Your cat deserves a glow up. Portraits from $6.
            <button
              onClick={() =>
                handleScrollToCreate(
                  purchaseOptions[0].id,
                  purchaseOptions[0].price,
                )
              }
              className="inline-flex items-center gap-1 rounded-full bg-black/20 px-3 py-1 text-xs font-bold text-white hover:bg-black/30"
            >
              Try now <ArrowRight className="h-3 w-3" />
            </button>
          </p>
        </div>

        <nav className="sticky top-0 z-50 border-b border-black/10 bg-white/90 backdrop-blur">
          <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center justify-between px-5">
            <Link href="/" className="flex items-center">
              <img
                src={cdnFile("logo/logo-pure-text.webp")}
                alt="Token Tails"
                className="h-8 w-auto"
              />
            </Link>

            <div className="hidden items-center gap-6 text-sm font-semibold text-black/70 md:flex">
              <a href="#create" className="hover:text-black">
                Create
              </a>
              <a href="#styles" className="hover:text-black">
                Styles
              </a>
              <a href="#pricing" className="hover:text-black">
                Pricing
              </a>
              <a href="#how-it-works" className="hover:text-black">
                How It Works
              </a>
              <a href="#faq" className="hover:text-black">
                FAQ
              </a>
            </div>

            <button
              onClick={() =>
                handleScrollToCreate(
                  purchaseOptions[0].id,
                  purchaseOptions[0].price,
                )
              }
              className="hidden rounded-full bg-[linear-gradient(135deg,#ff7b5a,#ffa947)] px-5 py-2.5 text-sm font-bold text-white shadow md:inline-flex"
            >
              Create Portrait 🎨
            </button>

            <button
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="inline-flex rounded-lg p-2 md:hidden"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </button>
          </div>

          <AnimatePresence>
            {mobileMenuOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden border-t border-black/10 bg-white px-5 py-4 md:hidden"
              >
                <div className="flex flex-col gap-3 text-sm font-medium text-black/80">
                  <a href="#create" onClick={() => setMobileMenuOpen(false)}>
                    Create
                  </a>
                  <a href="#styles" onClick={() => setMobileMenuOpen(false)}>
                    Styles
                  </a>
                  <a href="#pricing" onClick={() => setMobileMenuOpen(false)}>
                    Pricing
                  </a>
                  <a
                    href="#how-it-works"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    How It Works
                  </a>
                  <a href="#faq" onClick={() => setMobileMenuOpen(false)}>
                    FAQ
                  </a>
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      handleScrollToCreate(
                        purchaseOptions[0].id,
                        purchaseOptions[0].price,
                      );
                    }}
                    className="mt-2 rounded-full bg-[linear-gradient(135deg,#ff7b5a,#ffa947)] px-4 py-3 text-sm font-bold text-white"
                  >
                    Create Portrait 🎨
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </nav>

        <main className="pb-24 md:pb-0">
          <section
            id="create"
            className="relative overflow-hidden px-5 pb-12 pt-14 md:pb-20 md:pt-24"
          >
            {FLOATING_EMOJIS.map((emoji, index) => (
              <motion.span
                key={`${emoji}-${index}`}
                className="pointer-events-none absolute text-3xl opacity-20 md:text-4xl"
                style={{
                  left: `${10 + index * 17}%`,
                  top: `${8 + (index % 3) * 25}%`,
                }}
                animate={{
                  y: [0, -16, 0],
                  rotate: [0, 8, -8, 0],
                }}
                transition={{
                  duration: 3 + index * 0.4,
                  repeat: Infinity,
                  delay: index * 0.3,
                }}
              >
                {emoji}
              </motion.span>
            ))}

            <div className="mx-auto grid w-full max-w-[1200px] items-center gap-12 lg:grid-cols-2">
              <div className="relative z-10">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-6 inline-flex items-center gap-2 rounded-full bg-[#ffe8d6] px-5 py-2.5"
                >
                  <span className="text-sm font-semibold">Turn your</span>
                  <motion.span
                    key={heroWordIndex}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-full bg-white px-3 py-1 text-sm font-bold text-[#ff7b5a]"
                  >
                    {HERO_WORDS[heroWordIndex]}
                  </motion.span>
                  <span className="text-sm font-semibold">into royalty</span>
                </motion.div>

                <motion.h1
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="mb-5 text-4xl font-bold leading-tight md:text-6xl lg:text-7xl"
                  style={{ fontFamily: DISPLAY_FONT }}
                >
                  Your cat is literally{" "}
                  <span className="text-[#ff7b5a]">royalty</span> 👑
                </motion.h1>

                <motion.p
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="mb-8 max-w-xl text-base text-black/70 md:text-xl"
                >
                  Upload a photo, pick a vibe, and get a share-worthy portrait
                  in minutes. Free preview before purchase.
                </motion.p>

                <motion.div
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="flex flex-col gap-3 sm:flex-row"
                >
                  <button
                    onClick={() =>
                      handleScrollToCreate(
                        purchaseOptions[0].id,
                        purchaseOptions[0].price,
                      )
                    }
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#ff7b5a,#ffa947)] px-8 py-4 text-base font-bold text-white shadow-lg"
                  >
                    Create Portrait - ${purchaseOptions[0].price} 🎨
                  </button>
                  <a
                    href="#styles"
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-[#f3f4f6] px-8 py-4 text-base font-semibold text-black/80"
                  >
                    See styles 👀
                  </a>
                </motion.div>

                <div className="mt-8 grid max-w-xl grid-cols-3 gap-3">
                  {getStyleImages(selectedStyle).map((image, idx) => (
                    <motion.button
                      key={`${selectedStyle}-${idx}`}
                      whileHover={{ y: -6, scale: 1.02 }}
                      className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow"
                      onClick={() => setDrawerOpen(true)}
                    >
                      <img
                        src={image}
                        alt={`${STYLE_LABELS[selectedStyle]} example ${
                          idx + 1
                        }`}
                        className="aspect-[3/4] w-full object-cover"
                      />
                    </motion.button>
                  ))}
                </div>
              </div>

              <div className="relative z-10 space-y-4">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.22 }}
                  className="mx-auto w-full max-w-[200px] md:max-w-[230px] overflow-hidden rounded-2xl border border-black/10 bg-white shadow-lg"
                >
                  <video
                    src={CANVAS_VIDEO_URL}
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    poster="/portrait/commander-2.webp"
                    className="aspect-square w-full object-cover"
                  />
                  <div className="border-t border-black/10 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-black/60 text-center">
                      Canvas in real life
                    </p>
                  </div>
                </motion.div>

                <motion.div
                  id="upload-card"
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.28 }}
                  className="rounded-[28px] border border-black/10 bg-white p-5 shadow-[0_20px_60px_-25px_rgba(0,0,0,0.35)] md:p-7"
                >
                  <div className="mb-4 flex items-center justify-between rounded-2xl bg-[#f6f6f8] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-black/70">
                    <span>Upload</span>
                    <span
                      className={
                        isGenerating ? "text-[#ff7b5a]" : "text-black/40"
                      }
                    >
                      Generate
                    </span>
                    <span
                      className={
                        showPreview ? "text-[#ff7b5a]" : "text-black/40"
                      }
                    >
                      Purchase
                    </span>
                  </div>

                  {isGenerating ? (
                    <div className="flex flex-col items-center gap-5 px-2 py-8">
                      <div className="relative h-16 w-16">
                        <div className="absolute inset-0 rounded-full border-2 border-black/10" />
                        <motion.div
                          className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#ff7b5a] border-r-[#ffa947]"
                          animate={{ rotate: 360 }}
                          transition={{
                            duration: 1.2,
                            repeat: Infinity,
                            ease: "linear",
                          }}
                        />
                      </div>
                      <div className="w-full text-center">
                        <motion.p
                          key={generationMessage}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="text-sm font-semibold text-black/80"
                        >
                          {generationMessage || "Creating masterpiece..."}
                        </motion.p>
                        <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-[#f1f1f5]">
                          <motion.div
                            className="h-full rounded-full bg-[linear-gradient(135deg,#ff7b5a,#ffa947)]"
                            initial={{ width: 0 }}
                            animate={{ width: `${generationProgress}%` }}
                            transition={{ duration: 0.25, ease: "easeOut" }}
                          />
                        </div>
                        <p className="mt-2 text-xs text-black/50">
                          {Math.round(generationProgress)}%
                        </p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <UploadZone
                        onImageUpload={handleImageUpload}
                        uploadedImage={uploadedImage}
                        onClear={handleClear}
                        selectedStyle={selectedStyle}
                        onStyleChange={setSelectedStyle}
                        drawerOpen={drawerOpen}
                        onDrawerOpenChange={setDrawerOpen}
                      />

                      {uploadedImage && (
                        <motion.div
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="mt-5"
                        >
                          <button
                            onClick={() => void handleGenerate()}
                            disabled={isGenerating}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#ff7b5a,#ffa947)] px-5 py-3.5 text-sm font-bold text-white shadow disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Sparkles className="h-4 w-4" />
                            Generate Portrait
                          </button>
                        </motion.div>
                      )}
                    </>
                  )}

                  <div className="mt-6 border-t border-black/10 pt-5">
                    <p className="mb-2 text-center text-xs font-semibold uppercase tracking-widest text-black/45">
                      Trusted by cat parents worldwide
                    </p>
                    <AsSeenOn />
                  </div>
                </motion.div>
              </div>
            </div>
          </section>

          <section className="px-5 py-12 md:py-16">
            <div className="mx-auto grid w-full max-w-[1200px] grid-cols-2 gap-4 md:grid-cols-4">
              {STATS.map((stat, idx) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.07 }}
                  whileHover={{ y: -6, scale: 1.02 }}
                  className="rounded-3xl p-5 text-center md:p-7"
                  style={{ backgroundColor: stat.bg }}
                >
                  <motion.span
                    className="block text-3xl md:text-4xl"
                    animate={{ y: [0, -5, 0] }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      delay: idx * 0.25,
                    }}
                  >
                    {stat.emoji}
                  </motion.span>
                  <p
                    className="mt-3 text-2xl font-bold md:text-4xl"
                    style={{ fontFamily: DISPLAY_FONT }}
                  >
                    {stat.value}
                  </p>
                  <p className="mt-1 text-xs font-medium text-black/60 md:text-sm">
                    {stat.label}
                  </p>
                </motion.div>
              ))}
            </div>
          </section>

          <section className="bg-[#f7f7fb] px-5 py-16 md:py-24">
            <div className="mx-auto w-full max-w-[950px]">
              <div className="mb-10 text-center">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#ffe8d6] px-5 py-2.5 text-sm font-bold">
                  🎬 See it in action
                </div>
                <h2
                  className="text-3xl font-bold md:text-5xl"
                  style={{ fontFamily: DISPLAY_FONT }}
                >
                  From cat pic to masterpiece
                </h2>
              </div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="rounded-3xl bg-white p-5 shadow-xl md:p-8"
              >
                <div className="mb-6 grid gap-2 md:grid-cols-3">
                  {DEMO_STEPS.map((step, idx) => (
                    <button
                      key={step.step}
                      onClick={() => setActiveDemoStep(idx)}
                      className={`rounded-2xl p-4 text-left transition ${
                        activeDemoStep === idx
                          ? "scale-[1.01] bg-[#ffe8d6]"
                          : "bg-[#f5f5f8] hover:bg-[#ededf3]"
                      }`}
                    >
                      <p className="text-sm font-bold">{step.label}</p>
                      <p className="mt-1 text-xs text-black/60">{step.desc}</p>
                    </button>
                  ))}
                </div>

                <div className="relative h-[280px] overflow-hidden rounded-2xl bg-[#f5f5f8] md:h-[360px]">
                  <AnimatePresence mode="wait">
                    {activeDemoStep === 0 && (
                      <motion.div
                        key="demo-upload"
                        initial={{ opacity: 0, scale: 0.92 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.92 }}
                        className="absolute inset-0 flex flex-col items-center justify-center gap-4"
                      >
                        <motion.div
                          className="flex h-28 w-28 items-center justify-center rounded-3xl bg-[#ffe8d6] text-5xl md:h-36 md:w-36"
                          animate={{ y: [0, -10, 0] }}
                          transition={{ duration: 2, repeat: Infinity }}
                        >
                          🐱
                        </motion.div>
                        <div className="rounded-full bg-white px-5 py-2.5 shadow">
                          <p className="text-sm font-bold">
                            Drop your cat photo here
                          </p>
                        </div>
                      </motion.div>
                    )}

                    {activeDemoStep === 1 && (
                      <motion.div
                        key="demo-style"
                        initial={{ opacity: 0, scale: 0.92 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.92 }}
                        className="absolute inset-0 flex items-center justify-center gap-4 p-6"
                      >
                        {styleRotation.map((style, idx) => (
                          <motion.div
                            key={style}
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.1 }}
                            className={`rounded-2xl p-4 text-center md:p-6 ${
                              idx === 0
                                ? "bg-[#ffe8d6] ring-2 ring-[#ff9f43]"
                                : "bg-white"
                            }`}
                          >
                            <span className="block text-3xl md:text-4xl">
                              {idx === 0
                                ? "👑"
                                : idx === 1
                                ? "🏛️"
                                : idx === 2
                                ? "🎩"
                                : "⚔️"}
                            </span>
                            <p className="mt-2 text-sm font-bold">
                              {STYLE_LABELS[style]}
                            </p>
                          </motion.div>
                        ))}
                      </motion.div>
                    )}

                    {activeDemoStep === 2 && (
                      <motion.div
                        key="demo-result"
                        initial={{ opacity: 0, scale: 0.85 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.85 }}
                        className="absolute inset-0 flex items-center justify-center p-6"
                      >
                        <div className="relative">
                          <motion.div
                            className="overflow-hidden rounded-3xl border-4 border-white shadow-2xl"
                            animate={{ rotate: [-2, 2, -2] }}
                            transition={{ duration: 3, repeat: Infinity }}
                          >
                            <img
                              src={demoResultImage}
                              alt="AI portrait result"
                              className="w-[190px] object-cover md:w-[260px]"
                            />
                          </motion.div>
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: 0.25, type: "spring" }}
                            className="absolute -right-4 -top-4 rounded-full bg-[#e8f9f0] px-4 py-2 text-xs font-bold shadow"
                          >
                            Done! 🔥
                          </motion.div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/10">
                    <motion.div
                      key={activeDemoStep}
                      className="h-full bg-[linear-gradient(135deg,#ff7b5a,#ffa947)]"
                      initial={{ width: "0%" }}
                      animate={{ width: "100%" }}
                      transition={{ duration: 2.5, ease: "linear" }}
                    />
                  </div>
                </div>
              </motion.div>
            </div>
          </section>

          <section id="how-it-works" className="px-5 py-16 md:py-24">
            <div className="mx-auto w-full max-w-[1200px]">
              <div className="mb-12 text-center">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#fff9db] px-5 py-2.5 text-sm font-bold">
                  ⚡ Stupid easy
                </div>
                <h2
                  className="text-3xl font-bold md:text-5xl"
                  style={{ fontFamily: DISPLAY_FONT }}
                >
                  Three steps. That&apos;s it.
                </h2>
              </div>

              <div className="space-y-7">
                {HOW_IT_WORKS.map((step, idx) => (
                  <motion.div
                    key={step.num}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    whileHover={{ y: -4 }}
                    className={`flex flex-col items-center gap-8 rounded-3xl p-6 md:p-10 ${
                      idx % 2 === 0 ? "md:flex-row" : "md:flex-row-reverse"
                    }`}
                    style={{ backgroundColor: step.bg }}
                  >
                    <div className="flex-1">
                      <span className="mb-2 block text-5xl">{step.emoji}</span>
                      <span className="inline-flex rounded-full bg-white/70 px-3 py-1 text-xs font-bold uppercase tracking-widest text-black/60">
                        Step {step.num}
                      </span>
                      <h3
                        className="mt-4 text-2xl font-bold md:text-3xl"
                        style={{ fontFamily: DISPLAY_FONT }}
                      >
                        {step.title}
                      </h3>
                      <p className="mt-3 max-w-lg text-base leading-relaxed text-black/65 md:text-lg">
                        {step.desc}
                      </p>
                    </div>
                    <div className="w-full flex-1 max-w-[360px]">
                      <div className="overflow-hidden rounded-3xl border-4 border-white shadow-xl">
                        <img
                          src={step.image}
                          alt={step.title}
                          className="aspect-square w-full object-cover"
                        />
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>

          <section id="styles" className="bg-[#f7f7fb] px-5 py-16 md:py-24">
            <div className="mx-auto w-full max-w-[1200px]">
              <div className="mb-12 text-center">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#f1ebff] px-5 py-2.5 text-sm font-bold">
                  🎭 20+ styles and counting
                </div>
                <h2
                  className="text-3xl font-bold md:text-5xl"
                  style={{ fontFamily: DISPLAY_FONT }}
                >
                  Pick a style. They all slay.
                </h2>
                <p className="mt-3 text-lg text-black/65">
                  Every portrait is a whole vibe ✨
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 md:gap-5">
                {GALLERY_ITEMS.map((item, idx) => (
                  <motion.div
                    key={`${item.title}-${idx}`}
                    initial={{ opacity: 0, scale: 0.92 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: idx * 0.04 }}
                    whileHover={{ y: -8, scale: 1.03 }}
                    className="group cursor-pointer overflow-hidden rounded-3xl"
                    style={{ backgroundColor: item.bg }}
                  >
                    <div className="m-2 overflow-hidden rounded-2xl md:m-3">
                      <img
                        src={item.src}
                        alt={item.title}
                        className="aspect-[3/4] w-full object-cover transition-transform duration-500 group-hover:scale-110"
                      />
                    </div>
                    <div className="px-4 pb-4 pt-1">
                      <p
                        className="text-base font-bold"
                        style={{ fontFamily: DISPLAY_FONT }}
                      >
                        {item.title}
                      </p>
                      <p className="text-sm text-black/60">{item.style}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>

          <section className="px-5 py-16 md:py-24">
            <div className="mx-auto w-full max-w-[1200px]">
              <div className="mb-12 text-center">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#ffe8d6] px-5 py-2.5 text-sm font-bold">
                  💬 Real people, real cats
                </div>
                <h2
                  className="text-3xl font-bold md:text-5xl"
                  style={{ fontFamily: DISPLAY_FONT }}
                >
                  People are obsessed
                </h2>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                {TESTIMONIALS.map((testimonial, idx) => (
                  <motion.div
                    key={testimonial.name}
                    initial={{ opacity: 0, y: 18, rotate: 0 }}
                    whileInView={{
                      opacity: 1,
                      y: 0,
                      rotate: testimonial.rotate,
                    }}
                    viewport={{ once: true }}
                    transition={{ delay: idx * 0.08 }}
                    whileHover={{ rotate: 0, scale: 1.02 }}
                    className="rounded-3xl p-7"
                    style={{ backgroundColor: testimonial.bg }}
                  >
                    <div className="mb-4 flex items-center gap-3">
                      <span className="text-3xl">{testimonial.avatar}</span>
                      <div>
                        <p className="text-sm font-bold">{testimonial.name}</p>
                        <p className="text-xs text-black/60">
                          {testimonial.handle}
                        </p>
                      </div>
                    </div>
                    <p className="text-base leading-relaxed text-black/80">
                      &quot;{testimonial.text}&quot;
                    </p>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>

          <section id="pricing" className="bg-[#f7f7fb] px-5 py-16 md:py-24">
            <div className="mx-auto w-full max-w-[1060px]">
              <div className="mb-12 text-center">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#e8f9f0] px-5 py-2.5 text-sm font-bold">
                  💰 No subscriptions. No cap.
                </div>
                <h2
                  className="mb-3 text-3xl font-bold md:text-5xl"
                  style={{ fontFamily: DISPLAY_FONT }}
                >
                  Pick your vibe
                </h2>
                <p className="text-lg text-black/65">
                  One-time pricing. No hidden fees.
                </p>
              </div>

              <div className="grid gap-5 md:grid-cols-3">
                {purchaseOptions.map((plan, idx) => (
                  <motion.div
                    key={plan.id}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: idx * 0.08 }}
                    whileHover={{ y: -8 }}
                    className={`relative rounded-3xl p-7 ${
                      idx === 0
                        ? "bg-[#fff0e3]"
                        : idx === 1
                        ? "bg-[#e8f9f0]"
                        : "bg-[#f1ebff]"
                    }`}
                  >
                    {plan.badge && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <span
                          className={`rounded-full px-4 py-1.5 text-xs font-bold shadow ${
                            idx === 0
                              ? "bg-[linear-gradient(135deg,#ff7b5a,#ffa947)] text-white"
                              : "bg-white text-black"
                          }`}
                        >
                          {plan.badge}
                        </span>
                      </div>
                    )}

                    <span className="block text-4xl">
                      {idx === 0 ? "🖼️" : idx === 1 ? "🖨️" : "🎨"}
                    </span>
                    <h3
                      className="mt-3 text-xl font-bold"
                      style={{ fontFamily: DISPLAY_FONT }}
                    >
                      {plan.title}
                    </h3>
                    <div className="mb-3 mt-1">
                      <span
                        className="text-4xl font-bold"
                        style={{ fontFamily: DISPLAY_FONT }}
                      >
                        ${plan.price}
                      </span>
                      <span className="ml-1 text-sm text-black/60">
                        one-time
                      </span>
                    </div>
                    <p className="mb-5 text-sm leading-relaxed text-black/65">
                      {plan.description}
                    </p>

                    {plan.id === "digital" && (
                      <div className="mb-5 overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm">
                        <img
                          src="/portrait/digital.webp"
                          alt="Digital portrait example"
                          className="h-40 w-full object-cover"
                          loading="lazy"
                        />
                        <div className="border-t border-black/10 px-3 py-2 text-xs font-medium text-black/65">
                          Instant download preview
                        </div>
                      </div>
                    )}

                    {plan.id === "print" && (
                      <div className="mb-5 overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm">
                        <img
                          src="/portrait/print.webp"
                          alt="Printed portrait example"
                          className="h-40 w-full object-cover"
                          loading="lazy"
                        />
                        <div className="border-t border-black/10 px-3 py-2 text-xs font-medium text-black/65">
                          Print preview ( *Frame not included )
                        </div>
                      </div>
                    )}

                    {plan.id === "canvas" && (
                      <div className="mb-5 overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm">
                        <video
                          src={CANVAS_VIDEO_URL}
                          autoPlay
                          muted
                          loop
                          playsInline
                          preload="metadata"
                          poster="/portrait/commander-2.webp"
                          className="h-40 w-full object-cover"
                        />
                        <div className="border-t border-black/10 px-3 py-2 text-xs font-medium text-black/65">
                          Canvas in real life
                        </div>
                      </div>
                    )}

                    <div className="mb-5 rounded-2xl bg-white/70 p-4">
                      <ul className="space-y-2.5">
                        {plan.features.map((feature) => (
                          <li
                            key={feature}
                            className="flex items-center gap-2.5 text-sm"
                          >
                            <Check className="h-4 w-4 flex-shrink-0 text-[#24a36d]" />
                            <span className="font-medium text-black/85">
                              {feature}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <button
                      onClick={() => handleScrollToCreate(plan.id, plan.price)}
                      className={`w-full rounded-full py-3.5 text-sm font-bold ${
                        idx === 1
                          ? "bg-[linear-gradient(135deg,#ff7b5a,#ffa947)] text-white"
                          : "bg-black text-white"
                      }`}
                    >
                      {idx === 0
                        ? `Get Portrait - $${plan.price} ✨`
                        : idx === 1
                        ? `Order Print - $${plan.price} 🖨️`
                        : `Order Canvas - $${plan.price} 🖼️`}
                    </button>
                  </motion.div>
                ))}
              </div>

              <p className="mx-auto mt-10 inline-flex w-full justify-center rounded-full bg-white px-6 py-3 text-center text-sm text-black/60">
                🛡️ 30-day money-back support window for unresolved issues
              </p>
            </div>
          </section>

          <section id="faq" className="px-5 py-16 md:py-24">
            <div className="mx-auto w-full max-w-[760px]">
              <div className="mb-12 text-center">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#fff9db] px-5 py-2.5 text-sm font-bold">
                  ❓ FAQ
                </div>
                <h2
                  className="text-3xl font-bold md:text-4xl"
                  style={{ fontFamily: DISPLAY_FONT }}
                >
                  Got questions? We got answers.
                </h2>
              </div>

              <div className="space-y-3">
                {FAQS.map((faq, idx) => (
                  <motion.div
                    key={faq.q}
                    initial={{ opacity: 0, y: 8 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: idx * 0.05 }}
                    className={`overflow-hidden rounded-2xl transition-colors ${
                      activeFaq === idx ? "bg-[#ffe8d6]" : "bg-[#f5f5f8]"
                    }`}
                  >
                    <button
                      onClick={() =>
                        setActiveFaq((current) =>
                          current === idx ? null : idx,
                        )
                      }
                      className="flex w-full items-center justify-between p-5 text-left"
                    >
                      <span className="pr-4 text-sm font-semibold">
                        {faq.q}
                      </span>
                      <motion.span
                        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white"
                        animate={{ rotate: activeFaq === idx ? 180 : 0 }}
                      >
                        {activeFaq === idx ? (
                          <Minus className="h-4 w-4" />
                        ) : (
                          <Plus className="h-4 w-4" />
                        )}
                      </motion.span>
                    </button>
                    <AnimatePresence>
                      {activeFaq === idx && (
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: "auto" }}
                          exit={{ height: 0 }}
                          className="overflow-hidden"
                        >
                          <p className="px-5 pb-5 text-sm leading-relaxed text-black/65">
                            {faq.a}
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>

          <section className="px-5 pb-16 md:pb-24">
            <div className="mx-auto w-full max-w-[1200px]">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="overflow-hidden rounded-3xl bg-[linear-gradient(135deg,#ff7b5a,#ffa947)]"
              >
                <div className="flex flex-col items-center md:flex-row">
                  <div className="flex-1 p-8 text-center md:p-14 md:text-left">
                    <motion.p
                      className="mb-4 text-5xl"
                      animate={{ rotate: [0, 10, -10, 0] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    >
                      🎨
                    </motion.p>
                    <h2
                      className="mb-3 text-3xl font-bold text-white md:text-4xl"
                      style={{ fontFamily: DISPLAY_FONT }}
                    >
                      Your cat portrait is one click away
                    </h2>
                    <p className="mb-6 text-lg text-white/85">
                      Start from $6 and see your cat transformed into royalty.
                    </p>
                    <button
                      onClick={() =>
                        handleScrollToCreate(
                          purchaseOptions[0].id,
                          purchaseOptions[0].price,
                        )
                      }
                      className="inline-flex items-center gap-2 rounded-full bg-black px-8 py-4 text-lg font-bold text-white"
                    >
                      Create Portrait - ${purchaseOptions[0].price} 🐾
                    </button>
                  </div>
                  <div className="flex-1 max-w-md p-4">
                    <div className="overflow-hidden rounded-3xl border-4 border-white/30 shadow-2xl">
                      <video
                        src={CANVAS_VIDEO_URL}
                        autoPlay
                        muted
                        loop
                        playsInline
                        preload="metadata"
                        poster="/portrait/highness-2.webp"
                        className="h-[280px] w-full object-cover md:h-[390px]"
                      />
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </section>
        </main>

        <PortraitFooter />

        <motion.div
          initial={{ y: 90 }}
          animate={{ y: 0 }}
          className="fixed bottom-0 left-0 right-0 z-50 border-t border-black/10 bg-white/95 px-4 py-3 backdrop-blur md:hidden"
          style={{
            paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))",
          }}
        >
          <button
            onClick={() =>
              handleScrollToCreate(
                purchaseOptions[0].id,
                purchaseOptions[0].price,
              )
            }
            className="flex w-full items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#ff7b5a,#ffa947)] py-3.5 text-sm font-bold text-white shadow-lg"
          >
            Create Portrait - ${purchaseOptions[0].price} 🎨
            <ArrowRight className="h-4 w-4" />
          </button>
        </motion.div>
      </div>
    </>
  );
};

export default PortraitsPage;
