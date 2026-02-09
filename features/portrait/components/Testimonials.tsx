import { motion } from "framer-motion";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/features/portrait/ui/avatar";
import { Cat } from "lucide-react";

const testimonials = [
  {
    name: "Amanda Chen",
    avatar: "AC",
    avatarUrl:
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop&crop=face",
    location: "New York, NY",
    text: "I've ordered portraits from other sites before, but this is in a league of its own. The baroque styling is authentic and my cat Sir Whiskers has never looked more distinguished.",
    petName: "Sir Whiskers",
  },
  {
    name: "Michael Rodriguez",
    avatar: "MR",
    avatarUrl:
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=face",
    location: "Austin, TX",
    text: "Bought the canvas for my mom's birthday. She literally gasped when she unwrapped it. Her cat Mr. Fluffington now has a permanent spot above the fireplace.",
    petName: "Mr. Fluffington",
  },
  {
    name: "Jessica Williams",
    avatar: "JW",
    avatarUrl:
      "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&h=100&fit=crop&crop=face",
    location: "London, UK",
    text: "The attention to detail is remarkable. You can see each whisker rendered with care. I've recommended this to all my cat-loving friends.",
    petName: "Princess Luna",
  },
  {
    name: "David Park",
    avatar: "DP",
    avatarUrl:
      "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face",
    location: "Seattle, WA",
    text: "As a professional photographer, I'm very particular about image quality. The print exceeded my expectations - museum quality is not an exaggeration.",
    petName: "Duke Wellington",
  },
];

export const Testimonials = () => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.7 }}
      className="mt-16 max-w-5xl mx-auto"
    >
      <h3 className="font-display text-2xl text-center mb-8">
        What Our Customers Say
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {testimonials.map((testimonial, index) => (
          <motion.div
            key={testimonial.name}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 + index * 0.1 }}
            className="relative card-baroque rounded-xl p-6"
          >
            <Cat className="absolute top-4 right-4 w-8 h-8 text-gold/20" />

            <div className="flex items-start gap-4">
              <Avatar className="w-12 h-12 border-2 border-gold/30">
                <AvatarImage
                  src={testimonial.avatarUrl}
                  alt={testimonial.name}
                />
                <AvatarFallback className="bg-secondary text-foreground font-medium">
                  {testimonial.avatar}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1">
                <p className="font-medium text-foreground">
                  {testimonial.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {testimonial.location}
                </p>
              </div>
            </div>

            <p className="mt-4 text-sm text-foreground/90 leading-relaxed">
              "{testimonial.text}"
            </p>

            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-xs text-gold">
                Portrait of {testimonial.petName}
              </p>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
};
