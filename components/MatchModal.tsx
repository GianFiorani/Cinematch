'use client';

import { AnimatePresence, motion } from 'framer-motion';
import Image from 'next/image';
import { tmdbImageUrl, tmdbTitle, tmdbYear } from '@/lib/tmdb';
import { Button } from './ui/Button';
import type { TMDBItem } from '@/types';

interface MatchModalProps {
  item: TMDBItem | null;
  onClose: () => void;
}

export function MatchModal({ item, onClose }: MatchModalProps) {
  const poster = item ? tmdbImageUrl(item.poster_path, 'w500') : null;

  return (
    <AnimatePresence>
      {item && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="w-full max-w-sm rounded-3xl bg-brand-surface p-6 text-center shadow-2xl"
            initial={{ scale: 0.6, opacity: 0, y: 40 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.7, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
            onClick={(e) => e.stopPropagation()}
          >
            <motion.h2
              className="bg-gradient-to-r from-brand-pink to-brand-orange bg-clip-text text-3xl font-extrabold text-transparent"
              initial={{ scale: 0.8 }}
              animate={{ scale: [0.8, 1.15, 1] }}
              transition={{ duration: 0.5 }}
            >
              ¡Es un Match!
            </motion.h2>
            <p className="mt-1 text-sm text-white/60">Ambos quieren ver esto 👀</p>

            {poster && (
              <div className="relative mx-auto mt-5 aspect-[2/3] w-40 overflow-hidden rounded-2xl shadow-xl">
                <Image src={poster} alt={tmdbTitle(item)} fill className="object-cover" />
              </div>
            )}

            <h3 className="mt-4 text-xl font-bold">{tmdbTitle(item)}</h3>
            <p className="text-sm text-white/50">{tmdbYear(item)}</p>

            <Button onClick={onClose} className="mt-6 w-full">
              Seguir viendo
            </Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
