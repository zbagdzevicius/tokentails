import { motion } from "framer-motion";
import { Star } from "lucide-react";

const reviews = [
  {
    name: "Sarah M.",
    rating: 5,
    text: "Absolutely stunning! My cat looks like actual royalty. The canvas quality exceeded expectations.",
    date: "2 days ago",
    verified: true,
  },
  {
    name: "James T.",
    rating: 5,
    text: "Ordered as a gift for my wife - she cried happy tears. The detail is incredible. I can't stop staring at it.",
    date: "1 week ago",
    verified: true,
  },
  {
    name: "Emily R.",
    rating: 5,
    text: "Third portrait I've ordered. Each one hangs proudly in my living room. Addicted!",
    date: "2 weeks ago",
    verified: true,
  },
];

export const TrustpilotReviews = () => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
      className="mt-12 max-w-4xl mx-auto"
    >
      {/* Trustpilot Header - authentic styling */}
      <div className="flex flex-col items-center gap-2 mb-8">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-foreground">Excellent</span>
          <div className="flex items-center gap-0.5">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="w-4 h-4 bg-[#00b67a] flex items-center justify-center"
              >
                <svg
                  className="w-3 h-3 text-white fill-white"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              </div>
            ))}
            {/* 5th star - half green, half grey */}
            <div className="w-4 h-4 relative flex items-center justify-center bg-gray-300">
              <div className="absolute left-0 top-0 bottom-0 w-1/2 bg-[#00b67a] flex items-center justify-center"></div>
              <svg
                className="w-3 h-3 text-white fill-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
                viewBox="0 0 24 24"
              >
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
            </div>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Based on <span className="font-medium">167 reviews</span>
        </p>
        <div className="flex items-center gap-1.5 mt-1">
          <Star className="w-5 h-5 text-[#00b67a] fill-[#00b67a]" />
          <span className="font-semibold text-foreground tracking-tight">
            Trustpilot
          </span>
        </div>
      </div>

      {/* Review Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {reviews.map((review, index) => (
          <motion.div
            key={review.name}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 + index * 0.1 }}
            className="card-baroque rounded-lg p-4"
          >
            {/* Stars */}
            <div className="flex items-center gap-0.5 mb-3">
              {[...Array(review.rating)].map((_, i) => (
                <div
                  key={i}
                  className="w-5 h-5 bg-[#00b67a] flex items-center justify-center"
                >
                  <Star className="w-3 h-3 text-white fill-white" />
                </div>
              ))}
            </div>

            {/* Review text */}
            <p className="text-sm text-foreground mb-4 leading-relaxed">
              {review.text}
            </p>

            {/* Footer */}
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-3 border-t border-border/50">
              <div className="flex items-center gap-1">
                <span className="font-medium text-foreground">
                  {review.name}
                </span>
                {review.verified && <span className="text-[#00b67a]">✓</span>}
              </div>
              <span>{review.date}</span>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
};
