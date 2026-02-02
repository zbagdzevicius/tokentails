import { motion } from "framer-motion";

// Floating gold particles that drift upward
export const FloatingParticles = () => {
  const particles = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    delay: Math.random() * 5,
    duration: 8 + Math.random() * 6,
    size: 2 + Math.random() * 4,
    opacity: 0.1 + Math.random() * 0.3,
  }));

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((particle) => (
        <motion.div
          key={particle.id}
          className="absolute rounded-full bg-primary"
          style={{
            left: `${particle.x}%`,
            width: particle.size,
            height: particle.size,
            opacity: 0,
          }}
          animate={{
            y: [typeof window !== 'undefined' ? window.innerHeight : 800, -50],
            opacity: [0, particle.opacity, particle.opacity, 0],
          }}
          transition={{
            duration: particle.duration,
            delay: particle.delay,
            repeat: Infinity,
            ease: "linear",
          }}
        />
      ))}
    </div>
  );
};

// Shimmer effect for text or elements
export const ShimmerText = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => {
  return (
    <motion.span
      className={`relative inline-block ${className}`}
      style={{
        backgroundImage: "linear-gradient(90deg, hsl(var(--foreground)) 0%, hsl(var(--primary)) 50%, hsl(var(--foreground)) 100%)",
        backgroundSize: "200% 100%",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        backgroundClip: "text",
      }}
      animate={{
        backgroundPosition: ["200% 0%", "-200% 0%"],
      }}
      transition={{
        duration: 8,
        repeat: Infinity,
        ease: "linear",
      }}
    >
      {children}
    </motion.span>
  );
};

// Ambient glow that pulses softly
export const AmbientGlow = ({ className = "" }: { className?: string }) => {
  return (
    <motion.div
      className={`absolute rounded-full blur-3xl pointer-events-none ${className}`}
      style={{
        background: "radial-gradient(circle, hsl(var(--primary) / 0.15) 0%, transparent 70%)",
      }}
      animate={{
        scale: [1, 1.2, 1],
        opacity: [0.3, 0.5, 0.3],
      }}
      transition={{
        duration: 6,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    />
  );
};

// Elegant border glow animation
export const GlowBorder = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => {
  return (
    <motion.div
      className={`relative ${className}`}
      whileHover="hover"
    >
      <motion.div
        className="absolute -inset-px rounded-sm opacity-0"
        style={{
          background: "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.3) 50%, hsl(var(--primary)) 100%)",
        }}
        variants={{
          hover: {
            opacity: 0.8,
            transition: { duration: 0.3 },
          },
        }}
      />
      <motion.div
        className="absolute inset-0 rounded-sm opacity-0"
        style={{
          boxShadow: "0 0 40px hsl(var(--primary) / 0.3)",
        }}
        variants={{
          hover: {
            opacity: 1,
            transition: { duration: 0.3 },
          },
        }}
      />
      {children}
    </motion.div>
  );
};

// Luxury reveal animation for elements
export const LuxuryReveal = ({ 
  children, 
  delay = 0,
  className = "" 
}: { 
  children: React.ReactNode; 
  delay?: number;
  className?: string;
}) => {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 30, filter: "blur(10px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{
        duration: 0.8,
        delay,
        ease: [0.25, 0.1, 0.25, 1],
      }}
    >
      {children}
    </motion.div>
  );
};

// Sparkle effect that appears randomly
export const SparkleEffect = () => {
  const sparkles = Array.from({ length: 8 }, (_, i) => ({
    id: i,
    x: 10 + Math.random() * 80,
    y: 10 + Math.random() * 80,
    delay: Math.random() * 4,
    duration: 1 + Math.random() * 1.5,
  }));

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {sparkles.map((sparkle) => (
        <motion.div
          key={sparkle.id}
          className="absolute"
          style={{
            left: `${sparkle.x}%`,
            top: `${sparkle.y}%`,
          }}
          animate={{
            scale: [0, 1, 0],
            rotate: [0, 180],
            opacity: [0, 1, 0],
          }}
          transition={{
            duration: sparkle.duration,
            delay: sparkle.delay,
            repeat: Infinity,
            repeatDelay: 3 + Math.random() * 2,
          }}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            className="text-primary"
          >
            <path
              d="M12 0L14.59 9.41L24 12L14.59 14.59L12 24L9.41 14.59L0 12L9.41 9.41L12 0Z"
              fill="currentColor"
            />
          </svg>
        </motion.div>
      ))}
    </div>
  );
};

// Attention-grabbing pulse animation for upload area
export const AttentionPulse = () => {
  return (
    <>
      {/* Visible expanding pulse rings */}
      {[0, 1].map((i) => (
        <motion.div
          key={i}
          className="absolute inset-0 rounded-sm pointer-events-none"
          style={{
            border: "1px solid hsl(var(--primary))",
          }}
          initial={{ opacity: 0, scale: 1 }}
          animate={{
            opacity: [0, 0.5, 0],
            scale: [1, 1.06, 1.12],
          }}
          transition={{
            duration: 3,
            delay: i * 1.5,
            repeat: Infinity,
            ease: "easeOut",
          }}
        />
      ))}
      
      {/* Subtle glow underneath */}
      <motion.div
        className="absolute inset-0 rounded-sm pointer-events-none"
        style={{
          boxShadow: "0 0 30px hsl(var(--primary) / 0.2)",
        }}
        animate={{
          opacity: [0.3, 0.6, 0.3],
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
    </>
  );
};
