import { motion } from "framer-motion";

export const AsSeenOn = () => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.8 }}
      className="py-6 border-t border-border/30"
    >
      <p className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground text-center mb-4">
        As Seen In
      </p>
      <div className="flex items-center justify-center gap-6 md:gap-10 flex-wrap text-muted-foreground">
        {/* Forbes */}
        <motion.span
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9 }}
          className="text-lg md:text-xl font-serif font-bold tracking-wide opacity-40 hover:opacity-60 transition-opacity"
        >
          Forbes
        </motion.span>
        
        {/* The New York Times */}
        <motion.span
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.0 }}
          className="text-sm md:text-base font-serif font-bold tracking-tight opacity-40 hover:opacity-60 transition-opacity"
          style={{ fontFamily: "'Times New Roman', Times, serif" }}
        >
          The New York Times
        </motion.span>
        
        {/* ELLE */}
        <motion.span
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.1 }}
          className="text-lg md:text-xl font-serif font-bold tracking-[0.2em] opacity-40 hover:opacity-60 transition-opacity"
        >
          ELLE
        </motion.span>
        
        {/* VOGUE */}
        <motion.span
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2 }}
          className="text-lg md:text-xl font-serif tracking-[0.25em] opacity-40 hover:opacity-60 transition-opacity"
        >
          VOGUE
        </motion.span>
      </div>
    </motion.div>
  );
};
