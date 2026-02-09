import { STRIPE_API } from "@/api/stripe-api";
import { trackEvent } from "@/components/GoogleTagManager";
import { Testimonials } from "@/features/portrait/components/Testimonials";
import { TrustpilotReviews } from "@/features/portrait/components/TrustpilotReviews";
import { useToast } from "@/features/portrait/hooks/use-toast";
import { useCountdown } from "@/features/portrait/hooks/useCountdown";
import { Button } from "@/features/portrait/ui/button";
import { OrderStatus } from "@/models/order";
import { motion } from "framer-motion";
import {
  Cat,
  Check,
  Clock,
  Download,
  Loader2,
  Mail,
  PawPrint,
  RefreshCw,
  Sparkles,
  Timer,
  Truck,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface PurchaseOption {
  id: string;
  title: string;
  price: number;
  originalPrice?: number;
  badge?: string;
  description: string;
  features: string[];
  icon: typeof Download;
  ctaText: string;
  size?: string;
  delivery?: string;
  includesDigital?: boolean;
}

export const purchaseOptions: PurchaseOption[] = [
  {
    id: "digital",
    title: "Instant Masterpiece",
    price: 19,
    originalPrice: 29,
    badge: "Most Popular",
    description:
      "Instant high-resolution download — perfect for sharing or saving.",
    features: ["No Watermark", "High-Resolution Portrait ", "Instant Download"],
    icon: Download,
    ctaText: "Download Now",
  },
  {
    id: "print",
    title: "Fine Art Print",
    price: 69,
    badge: "Recommended",
    description:
      "Printed on museum-quality archival paper with fade-resistant inks.",
    features: [
      "Fade-resistant inks",
      "Museum-quality archival paper",
      "Made to last decades",
    ],
    icon: PawPrint,
    ctaText: "Order Print",
    size: '12" x 16"',
    delivery: "3-12 days",
    includesDigital: true,
  },
  {
    id: "canvas",
    title: "Large Canvas",
    price: 199,
    badge: "The Perfect Gift 🐱",
    description: "Gallery-quality canvas on wood — arrives ready to hang.",
    features: [
      "Ready to hang",
      'Cotton-blend canvas, 1.25" thick',
      "Mounting included",
    ],
    icon: Cat,
    ctaText: "Order Canvas",
    size: '18" x 24"',
    delivery: "3-12 days",
    includesDigital: true,
  },
];

interface PreviewPageProps {
  generatedImages: string[];
  onRetry: () => void;
  onBack: () => void;
  eventId?: string;
  imageId?: string;
  orderStatus?: OrderStatus | null;
  isPollingOrder?: boolean;
  orderProductType?: string | null;
  orderId?: string;
  blurHalf?: boolean;
  showWatermark?: boolean;
}

export const PreviewPage = ({
  generatedImages,
  onRetry,
  onBack,
  imageId,
  orderStatus,
  isPollingOrder = false,
  orderProductType,
  orderId,
  blurHalf = false,
  showWatermark = true,
}: PreviewPageProps) => {
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isProcessingPurchase, setIsProcessingPurchase] = useState(false);
  const [currentImages, setCurrentImages] = useState<string[]>(generatedImages);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [pendingPurchase, setPendingPurchase] = useState<{
    optionId: string;
    price: number;
  } | null>(null);
  const { formattedTime, isExpired } = useCountdown(15);
  const { toast } = useToast();
  const regenerationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Get default option (first option - digital)
  const defaultOption = purchaseOptions[0];

  // Sync currentImages with generatedImages prop
  const prevImageUrlRef = useRef<string>(generatedImages[0] || "");
  useEffect(() => {
    const currentImageUrl = generatedImages[0] || "";
    // Check if image URL changed (regeneration completed)
    if (
      isRegenerating &&
      currentImageUrl &&
      currentImageUrl !== prevImageUrlRef.current
    ) {
      // Clear timeout if image updated
      if (regenerationTimeoutRef.current) {
        clearTimeout(regenerationTimeoutRef.current);
        regenerationTimeoutRef.current = null;
      }
      setIsRegenerating(false);
    }
    prevImageUrlRef.current = currentImageUrl;
    setCurrentImages(generatedImages);
  }, [generatedImages, isRegenerating]);

  // Track AddToCart event when preview page loads
  useEffect(() => {
    trackEvent("add_to_cart", {
      event_id: imageId,
      item_name: purchaseOptions[0].id,
      item_category: "portrait",
      item_id: purchaseOptions[0].id,
      value: purchaseOptions[0].price,
      currency: "USD",
      quantity: 1,
    });
  }, [imageId]);

  const handleRetry = async () => {
    if (!imageId) {
      toast({
        title: "No image to regenerate",
        description: "Please upload an image first.",
        variant: "destructive",
      });
      return;
    }

    setIsRegenerating(true);
    // Clear any existing timeout
    if (regenerationTimeoutRef.current) {
      clearTimeout(regenerationTimeoutRef.current);
    }
    // Fallback: reset after 60 seconds if no update
    regenerationTimeoutRef.current = setTimeout(() => {
      setIsRegenerating(false);
      regenerationTimeoutRef.current = null;
    }, 60000);

    try {
      // Use parent's onRetry which handles style rotation
      // The parent will update generatedImages, which will sync to currentImages via useEffect
      await onRetry();
    } catch (error) {
      // Reset loading state on error
      if (regenerationTimeoutRef.current) {
        clearTimeout(regenerationTimeoutRef.current);
        regenerationTimeoutRef.current = null;
      }
      setIsRegenerating(false);
    }
  };

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handlePurchaseClick = (optionId: string, price: number) => {
    // Store the pending purchase and show email modal
    setPendingPurchase({ optionId, price });
    setShowEmailModal(true);
    setEmail("");
    setEmailError("");
  };

  const handleEmailSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();

    if (!email.trim()) {
      setEmailError("Email is required");
      return;
    }

    if (!validateEmail(email)) {
      setEmailError("Please enter a valid email address");
      return;
    }

    if (!pendingPurchase) {
      return;
    }

    const { optionId, price } = pendingPurchase;

    // Find the selected option
    const selectedOption =
      purchaseOptions.find((opt) => opt.id === optionId) || defaultOption;

    // Track Begin Checkout event
    trackEvent("begin_checkout", {
      event_id: imageId,
      item_id: selectedOption.id,
      item_name: selectedOption.id,
      value: price,
      currency: "USD",
    });

    setShowEmailModal(false);
    setIsProcessingPurchase(true);

    try {
      // Create Stripe Checkout Session with email
      const { url } = await STRIPE_API.createCheckoutSession({
        amount: Math.round(price * 100), // Convert to cents
        productType: optionId as "digital" | "print" | "canvas",
        imageId: imageId,
        email: email.trim(),
      });

      // Redirect to Stripe Checkout
      if (url) {
        window.location.href = url;
      } else {
        throw new Error("No checkout URL returned");
      }
    } catch (error) {
      console.error("Error creating checkout session:", error);
      toast({
        title: "Checkout failed",
        description: "Please try again.",
        variant: "destructive",
      });
      setIsProcessingPurchase(false);
      setPendingPurchase(null);
    }
  };

  const handleCloseEmailModal = () => {
    setShowEmailModal(false);
    setEmail("");
    setEmailError("");
    setPendingPurchase(null);
  };

  return (
    <div className="min-h-screen bg-background py-8">
      <div className="container mx-auto px-4">
        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground mb-8">
          <span className="text-primary">Upload</span>
          <span className="w-8 h-px bg-primary" />
          <span className="text-primary">Preview</span>
          <span className="w-8 h-px bg-border" />
          <span>Download or Order</span>
        </div>

        {/* Title */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-display text-4xl md:text-5xl text-center mb-8"
        >
          {orderStatus === OrderStatus.COMPLETE
            ? "Purchase Complete! 🎉"
            : isPollingOrder
            ? "Processing Your Order..."
            : "Your Masterpiece is Ready!"}
        </motion.h1>

        {/* Order Status Loader */}
        {isPollingOrder && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-4 mb-8"
          >
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-muted-foreground text-sm">
              Waiting for payment confirmation...
            </p>
          </motion.div>
        )}

        {/* Success Message for Print/Canvas */}
        {orderStatus === OrderStatus.COMPLETE &&
          (orderProductType === "print" || orderProductType === "canvas") && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-2xl mx-auto mb-8 p-6 card-baroque rounded-xl text-center"
            >
              <p className="text-lg mb-2">
                Your product will be shipped to you in 3-12 days
              </p>
              <p className="text-muted-foreground">
                Thanks for your purchase{" "}
                <span className="text-primary">❤️</span>
              </p>
            </motion.div>
          )}

        {/* Generated Images */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="max-w-4xl mx-auto mb-12"
        >
          {/* Main Image */}
          <div className="relative mb-4">
            <div
              className="portrait-frame rounded-lg overflow-hidden max-w-lg mx-auto select-none relative"
              onContextMenu={(e) => e.preventDefault()}
              onDragStart={(e) => e.preventDefault()}
            >
              <img
                src={
                  currentImages[selectedImageIndex] ||
                  generatedImages[selectedImageIndex]
                }
                alt="Generated royal portrait"
                className="w-full aspect-[3/4] object-cover pointer-events-none"
                draggable={false}
              />
              {/* Blur overlay for right half - visible but blurred */}
              {blurHalf && (
                <>
                  {/* Strongly blurred right half */}
                  <div className="absolute top-0 right-0 w-1/2 h-full pointer-events-none overflow-hidden">
                    <img
                      src={
                        currentImages[selectedImageIndex] ||
                        generatedImages[selectedImageIndex]
                      }
                      alt=""
                      className="w-full h-full object-cover"
                      style={{
                        filter: "blur(40px)",
                        transform: "scale(1.1)",
                      }}
                    />
                  </div>
                  {/* Subtle overlay to enhance the blur effect without hiding the image */}
                  <div className="absolute top-0 right-0 w-1/2 h-full pointer-events-none bg-background/10" />
                  {/* Hard edge divider line */}
                  <div
                    className="absolute top-0 left-1/2 h-full w-px bg-border pointer-events-none"
                    style={{ transform: "translateX(-50%)" }}
                  />
                </>
              )}
              {/* Repeating logo watermark overlay - hide if order is complete or showWatermark is false */}
              {showWatermark && orderStatus !== OrderStatus.COMPLETE && (
                <div
                  className="absolute inset-[-50%] pointer-events-none select-none"
                  style={{
                    backgroundImage: `url(/portrait/watermark-logo.webp)`,
                    backgroundSize: "18%",
                    backgroundRepeat: "space",
                    backgroundPosition: "center",
                    opacity: 0.1,
                    transform: "rotate(-25deg)",
                  }}
                />
              )}
              {/* FREE PREVIEW badge - top right */}
              {orderStatus !== OrderStatus.COMPLETE && (
                <div className="absolute top-4 right-4 flex items-center px-2.5 py-1 rounded-full bg-background/80 backdrop-blur-sm border border-border pointer-events-none z-20">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                    FREE PREVIEW
                  </span>
                </div>
              )}
              {/* High quality detail preview circle - bottom right */}
              <div className="absolute bottom-4 right-4 pointer-events-none z-10 group">
                {/* Quality tag on top */}
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-background/95 backdrop-blur-md px-2 pb-8 rounded-lg shadow-lg border border-primary/20">
                  <span className="text-[9px] font-bold text-primary uppercase tracking-widest whitespace-nowrap">
                    4K Details
                  </span>
                </div>
                {/* Circle container */}
                <div className="relative w-28 h-28 rounded-full overflow-hidden border-[3px] border-primary/80 shadow-2xl">
                  <div className="relative w-full h-full">
                    <img
                      src={
                        currentImages[selectedImageIndex] ||
                        generatedImages[selectedImageIndex]
                      }
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover"
                      style={{
                        objectPosition: "center center",
                        transform: "scale(10)",
                        transformOrigin: "center center",
                      }}
                    />
                    {/* Gradient overlay for better contrast */}
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background/20 rounded-full" />
                  </div>
                  {/* Outer glow ring */}
                  <div className="absolute -inset-1 rounded-full bg-primary/20 blur-sm pointer-events-none" />
                </div>
              </div>
            </div>
            {!orderId && (
              <button
                onClick={handleRetry}
                disabled={isRegenerating || !imageId}
                className="absolute top-16 right-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-background/80 backdrop-blur-sm text-sm hover:bg-background transition-colors border border-border disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw
                  className={`w-3 h-3 ${isRegenerating ? "animate-spin" : ""}`}
                />
                {isRegenerating ? "Redrawing..." : "Redraw"}
              </button>
            )}
          </div>
        </motion.div>

        {/* Download Button for Completed Orders */}
        {orderStatus === OrderStatus.COMPLETE && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-center mb-8"
          >
            <Button
              variant="hero"
              size="lg"
              onClick={() => {
                const imageUrl =
                  currentImages[selectedImageIndex] ||
                  generatedImages[selectedImageIndex];
                if (imageUrl) {
                  const link = document.createElement("a");
                  link.href = imageUrl;
                  link.download = `portrait-${imageId || "download"}.jpg`;
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                }
              }}
              className="min-w-[200px]"
            >
              <Download className="w-4 h-4 mr-2" />
              DOWNLOAD
            </Button>
          </motion.div>
        )}

        {/* Purchase Options - hide if order is complete */}
        {orderStatus !== OrderStatus.COMPLETE && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <h2 className="text-display text-2xl text-center mb-8">
              Choose Your Format
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {purchaseOptions.map((option, index) => {
                const Icon = option.icon;
                return (
                  <motion.div
                    key={option.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 + index * 0.1 }}
                    className={`relative card-baroque rounded-xl p-6 flex flex-col ${
                      option.badge === "Most Popular"
                        ? "ring-2 ring-primary"
                        : ""
                    }`}
                  >
                    {option.badge && (
                      <div
                        className={`absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-medium ${
                          option.badge === "Most Popular" ||
                          option.badge === "Recommended"
                            ? "bg-primary text-primary-foreground"
                            : "bg-gold text-background"
                        }`}
                      >
                        {option.badge}
                      </div>
                    )}

                    <div className="text-center mb-4">
                      <h3 className="font-display text-xl mb-2">
                        {option.title}
                      </h3>
                      <div className="flex items-center justify-center gap-2">
                        {option.originalPrice && !isExpired && (
                          <span className="text-muted-foreground line-through text-lg">
                            ${option.originalPrice}
                          </span>
                        )}
                        <span className="text-3xl font-bold">
                          $
                          {option.id === "digital" && isExpired
                            ? option.originalPrice
                            : option.price}
                        </span>
                      </div>
                      {/* Countdown Timer for Digital Option */}
                      {option.id === "digital" && !isExpired && (
                        <div className="flex items-center justify-center gap-1.5 mt-2 text-sm text-primary">
                          <Timer className="w-4 h-4" />
                          <span>Expires in</span>
                          <span className="font-mono font-semibold">
                            {formattedTime}
                          </span>
                        </div>
                      )}
                      {option.id === "digital" && isExpired && (
                        <div className="mt-2 text-sm text-muted-foreground">
                          Discount expired
                        </div>
                      )}
                    </div>

                    <p className="text-sm text-muted-foreground text-center mb-4">
                      {option.description}
                    </p>

                    {/* Size Display */}
                    {option.size && (
                      <div className="mb-4">
                        <p className="text-sm text-muted-foreground">
                          Size:{" "}
                          <span className="text-foreground font-medium">
                            {option.size}
                          </span>
                        </p>
                      </div>
                    )}

                    {/* Features */}
                    <ul className="space-y-2 mb-4 flex-1">
                      {option.features.map((feature) => (
                        <li
                          key={feature}
                          className="flex items-start gap-2 text-sm"
                        >
                          <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>

                    {/* Delivery & Extras */}
                    {option.delivery && (
                      <div className="mb-4 space-y-2 text-sm">
                        <div className="flex items-center gap-2 text-gold">
                          <Truck className="w-4 h-4" />
                          <span>Free Shipping ($20 value)</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Clock className="w-4 h-4" />
                          <span>Delivery: {option.delivery}</span>
                        </div>
                        {option.includesDigital && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Sparkles className="w-4 h-4" />
                            <span>+ Includes digital download</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* CTA */}
                    <Button
                      variant={option.id === "digital" ? "hero" : "baroque"}
                      size="lg"
                      className="w-full"
                      onClick={() =>
                        handlePurchaseClick(
                          option.id,
                          option.id === "digital" && isExpired
                            ? option.originalPrice || option.price
                            : option.price
                        )
                      }
                      disabled={isProcessingPurchase}
                    >
                      <Icon className="w-4 h-4" />
                      {isProcessingPurchase ? "Processing..." : option.ctaText}
                    </Button>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Trustpilot Reviews */}
        <TrustpilotReviews />

        {/* Testimonials */}
        <Testimonials />

        {/* Back Button */}
        <div className="mt-12 text-center">
          <Button variant="ghost" onClick={onBack}>
            ← Create another portrait
          </Button>
        </div>
      </div>

      {/* Email Modal */}
      {showEmailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="relative bg-background border border-border rounded-xl p-6 w-full max-w-md mx-4 card-baroque"
          >
            <button
              onClick={handleCloseEmailModal}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="mb-4">
              <h3 className="text-display text-2xl mb-2">Enter Your Email</h3>
              <p className="text-sm text-muted-foreground">
                We need your email to process your order.
              </p>
            </div>

            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium mb-2"
                >
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setEmailError("");
                    }}
                    placeholder="your.email@example.com"
                    className="w-full pl-10 pr-4 py-3 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    autoFocus
                  />
                </div>
                {emailError && (
                  <p className="mt-2 text-sm text-destructive">{emailError}</p>
                )}
              </div>

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleCloseEmailModal}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="hero"
                  className="flex-1"
                  disabled={isProcessingPurchase}
                >
                  Continue to Checkout
                </Button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
};
