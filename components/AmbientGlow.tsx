'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { tmdbImageUrl } from '@/lib/tmdb';

interface AmbientGlowProps {
  posterPath: string | null;
}

export function AmbientGlow({ posterPath }: AmbientGlowProps) {
  const url = tmdbImageUrl(posterPath, 'w342');

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <AnimatePresence>
        {url && (
          <motion.div
            key={url}
            className="absolute inset-0 scale-125 bg-cover bg-center blur-3xl"
            style={{ backgroundImage: `url(${url})` }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.35 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: 'easeInOut' }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
