'use client';

import { LoaderCircle } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

export function LoadingToast({ visible, label = 'Atualizando…' }: { visible: boolean; label?: string }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: -10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.97 }}
          className="pointer-events-none fixed left-1/2 top-[max(0.75rem,env(safe-area-inset-top))] z-[300] flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-white/10 bg-[#17171c]/95 px-3.5 py-2 text-xs font-bold text-white shadow-xl shadow-black/35 backdrop-blur-md"
        >
          <LoaderCircle className="size-3.5 animate-spin text-violet-300" />
          {label}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
