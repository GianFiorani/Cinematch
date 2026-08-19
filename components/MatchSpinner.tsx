'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, animate, motion, useMotionValue } from 'framer-motion';
import confetti from 'canvas-confetti';
import Image from 'next/image';
import { tmdbImageUrl, tmdbTitle, tmdbYear } from '@/lib/tmdb';
import { Button } from './ui/Button';
import type { MatchRow, TMDBItem } from '@/types';

interface MatchSpinnerProps {
  open: boolean;
  matches: MatchRow[];
  itemCache: Record<number, TMDBItem>;
  onClose: () => void;
}

const CONFETTI_COLORS = ['#FD267A', '#FF6036', '#31D0AA', '#FFD166'];
// Poster card size (w-24 = 96px) plus the gap-3 (12px) between them — the strip's math below
// is all multiples of this one slot width.
const SLOT = 108;
const SPIN_CYCLES = 6;
const SPIN_DURATION = 2.5;

export function MatchSpinner({ open, matches, itemCache, onClose }: MatchSpinnerProps) {
  const [reel, setReel] = useState<MatchRow[]>([]);
  const [winner, setWinner] = useState<MatchRow | null>(null);
  const [spinning, setSpinning] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);

  useEffect(() => {
    if (!open || matches.length < 2) return;

    setWinner(null);
    setSpinning(true);
    x.set(0);

    const winnerIndex = Math.floor(Math.random() * matches.length);
    // Several full loops of the whole match list, landing on the winner only on the very
    // last one — that's what reads as "spinning" instead of just sliding to a fixed slot.
    const finalPosition = SPIN_CYCLES * matches.length + winnerIndex;
    const builtReel = Array.from({ length: finalPosition + 1 }, (_, i) => matches[i % matches.length]);
    setReel(builtReel);

    // Wait for the reel to paint at x=0 before animating, so the spin is visible from the
    // first frame instead of jumping straight into the middle of the motion.
    let cleanupControls: ReturnType<typeof animate> | undefined;
    const frame = requestAnimationFrame(() => {
      const viewportWidth = viewportRef.current?.offsetWidth ?? 0;
      const target = finalPosition * SLOT + SLOT / 2 - viewportWidth / 2;
      cleanupControls = animate(x, -target, {
        duration: SPIN_DURATION,
        // Fast start, hard deceleration into the stop — a roulette slowing down, not a linear
        // slide.
        ease: [0.12, 0, 0.16, 1],
        onComplete: () => {
          setSpinning(false);
          setWinner(matches[winnerIndex]);
          confetti({ particleCount: 120, spread: 100, startVelocity: 45, origin: { y: 0.5 }, colors: CONFETTI_COLORS, zIndex: 200 });
        },
      });
    });

    return () => {
      cancelAnimationFrame(frame);
      cleanupControls?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, matches]);

  const winnerItem = winner ? itemCache[winner.tmdb_id] : null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 px-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => !spinning && onClose()}
        >
          <motion.div
            className="w-full max-w-sm rounded-3xl bg-brand-surface p-6 text-center shadow-2xl"
            initial={{ scale: 0.6, opacity: 0, y: 40 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.7, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="bg-gradient-to-r from-brand-pink to-brand-orange bg-clip-text text-2xl font-extrabold text-transparent">
              {spinning ? 'Girando la ruleta...' : winnerItem ? '¡La elegida! 🎉' : 'Sorteando...'}
            </h2>

            <div ref={viewportRef} className="relative mt-5 h-36 overflow-hidden">
              {/* Fade the reel edges so posters look like they're sliding in/out of frame. */}
              <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-brand-surface to-transparent" />
              <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-brand-surface to-transparent" />
              <div
                className="pointer-events-none absolute left-1/2 top-0 z-10 h-full w-24 -translate-x-1/2 rounded-2xl border-4 border-brand-pink"
                style={{ boxShadow: '0 0 0 999px rgba(0,0,0,0.55)' }}
              />
              <motion.div className="absolute left-1/2 flex gap-3" style={{ x }}>
                {reel.map((m, i) => {
                  const reelItem = itemCache[m.tmdb_id];
                  const poster = reelItem ? tmdbImageUrl(reelItem.poster_path, 'w92') : null;
                  return (
                    <div key={`${m.id}-${i}`} className="relative h-36 w-24 shrink-0 overflow-hidden rounded-xl bg-black/30">
                      {poster && (
                        <Image src={poster} alt={reelItem ? tmdbTitle(reelItem) : ''} fill className="object-cover" />
                      )}
                    </div>
                  );
                })}
              </motion.div>
            </div>

            {winnerItem && !spinning && (
              <>
                <h3 className="mt-4 text-xl font-bold">{tmdbTitle(winnerItem)}</h3>
                <p className="text-sm text-white/50">{tmdbYear(winnerItem)}</p>
                <Button onClick={onClose} className="mt-6 w-full">
                  ¡Vemos esto! 🎬
                </Button>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
