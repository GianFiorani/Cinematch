'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Image from 'next/image';
import { tmdbImageUrl, tmdbRuntime, tmdbTitle, tmdbYear } from '@/lib/tmdb';
import { Spinner } from './ui/Spinner';
import type { TMDBItem } from '@/types';

interface DetailModalProps {
  item: TMDBItem | null;
  detail: TMDBItem | null;
  loading: boolean;
  onClose: () => void;
}

export function DetailModal({ item, detail, loading, onClose }: DetailModalProps) {
  const [playingTrailer, setPlayingTrailer] = useState(false);

  const data = detail ?? item;
  const poster = data ? tmdbImageUrl(data.poster_path, 'w500') : null;
  const runtime = data ? tmdbRuntime(data) : null;
  const trailerKey = detail?.trailerKey;

  function handleClose() {
    setPlayingTrailer(false);
    onClose();
  }

  return (
    <AnimatePresence>
      {item && (
        <motion.div
          className="fixed inset-0 z-[110] flex items-end justify-center bg-black/80"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleClose}
        >
          <motion.div
            className="no-scrollbar max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-brand-surface"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            {poster && (
              <div className="relative aspect-[2/3] w-full flex-shrink-0">
                <Image src={poster} alt={data ? tmdbTitle(data) : ''} fill className="object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-brand-surface via-transparent to-transparent" />
                <button
                  onClick={handleClose}
                  aria-label="Cerrar"
                  className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-lg text-white"
                >
                  ✕
                </button>
              </div>
            )}

            <div className="p-5">
              <h2 className="text-2xl font-bold">{data && tmdbTitle(data)}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-white/60">
                <span>{data && tmdbYear(data)}</span>
                {runtime && (
                  <>
                    <span>•</span>
                    <span>{runtime}</span>
                  </>
                )}
                {data?.genres && data.genres.length > 0 && (
                  <>
                    <span>•</span>
                    <span>{data.genres.map((g) => g.name).join(', ')}</span>
                  </>
                )}
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-10">
                  <Spinner className="h-6 w-6" />
                </div>
              ) : (
                <>
                  {trailerKey && (
                    <div className="mt-4">
                      {playingTrailer ? (
                        <div className="aspect-video w-full overflow-hidden rounded-xl">
                          <iframe
                            src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1`}
                            title="Tráiler"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                            className="h-full w-full"
                          />
                        </div>
                      ) : (
                        <button
                          onClick={() => setPlayingTrailer(true)}
                          className="relative block aspect-video w-full overflow-hidden rounded-xl"
                          aria-label="Ver tráiler"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`https://img.youtube.com/vi/${trailerKey}/hqdefault.jpg`}
                            alt="Miniatura del tráiler"
                            className="h-full w-full object-cover"
                          />
                          <span className="absolute inset-0 flex items-center justify-center bg-black/30">
                            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 text-2xl text-black">
                              ▶
                            </span>
                          </span>
                        </button>
                      )}
                    </div>
                  )}

                  {data?.director && (
                    <p className="mt-4 text-sm text-white/70">
                      <span className="font-semibold text-white">Dirección:</span> {data.director}
                    </p>
                  )}
                  {data?.cast && data.cast.length > 0 && (
                    <p className="mt-1 text-sm text-white/70">
                      <span className="font-semibold text-white">Reparto:</span> {data.cast.join(', ')}
                    </p>
                  )}

                  <p className="mt-4 text-sm leading-relaxed text-white/80">{data?.overview}</p>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
