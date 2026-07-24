'use client';

import { forwardRef, useImperativeHandle } from 'react';
import { motion, useAnimationControls, useMotionValue, useTransform, type PanInfo } from 'framer-motion';
import Image from 'next/image';
import { tmdbImageUrl, tmdbRuntime, tmdbTitle, tmdbYear } from '@/lib/tmdb';
import type { TMDBItem, Vote } from '@/types';

export interface SwipeCardHandle {
  swipe: (vote: Vote) => void;
}

interface SwipeCardProps {
  item: TMDBItem;
  isTop: boolean;
  stackIndex: number;
  onSwiped: (vote: Vote) => void;
  onShowDetail: (item: TMDBItem) => void;
}

const SWIPE_THRESHOLD = 120;

export const SwipeCard = forwardRef<SwipeCardHandle, SwipeCardProps>(
  ({ item, isTop, stackIndex, onSwiped, onShowDetail }, ref) => {
    const controls = useAnimationControls();
    const x = useMotionValue(0);
    const rotate = useTransform(x, [-300, 300], [-18, 18]);
    const likeOpacity = useTransform(x, [20, 120], [0, 1]);
    const nopeOpacity = useTransform(x, [-120, -20], [1, 0]);

    useImperativeHandle(ref, () => ({
      swipe: (vote: Vote) => {
        controls
          .start({
            x: vote === 'like' ? 600 : -600,
            rotate: vote === 'like' ? 20 : -20,
            opacity: 0,
            transition: { duration: 0.3 },
          })
          .then(() => onSwiped(vote));
      },
    }));

    function handleDragEnd(_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) {
      if (info.offset.x > SWIPE_THRESHOLD) {
        controls
          .start({ x: 600, rotate: 20, opacity: 0, transition: { duration: 0.25 } })
          .then(() => onSwiped('like'));
      } else if (info.offset.x < -SWIPE_THRESHOLD) {
        controls
          .start({ x: -600, rotate: -20, opacity: 0, transition: { duration: 0.25 } })
          .then(() => onSwiped('dislike'));
      } else {
        controls.start({ x: 0, rotate: 0, transition: { type: 'spring', stiffness: 300, damping: 25 } });
      }
    }

    const poster = tmdbImageUrl(item.poster_path, 'w500');
    const runtime = tmdbRuntime(item);

    return (
      <motion.div
        className="absolute inset-0 origin-bottom select-none"
        style={{
          x: isTop ? x : undefined,
          rotate: isTop ? rotate : 0,
          scale: 1 - stackIndex * 0.04,
          top: stackIndex * 10,
          zIndex: 100 - stackIndex,
        }}
        drag={isTop ? 'x' : false}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={1}
        onDragEnd={isTop ? handleDragEnd : undefined}
        animate={controls}
      >
        <div className="relative h-full w-full overflow-hidden rounded-3xl bg-brand-surface shadow-2xl">
          {poster ? (
            <Image
              src={poster}
              alt={tmdbTitle(item)}
              fill
              sizes="(max-width: 480px) 100vw, 400px"
              className="object-cover"
              draggable={false}
              priority={stackIndex === 0}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-brand-surface text-white/30">
              Sin imagen
            </div>
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent" />

          {isTop && (
            <>
              <motion.span
                style={{ opacity: likeOpacity }}
                className="absolute left-6 top-8 -rotate-12 rounded-lg border-4 border-like px-3 py-1 text-2xl font-extrabold text-like"
              >
                LIKE
              </motion.span>
              <motion.span
                style={{ opacity: nopeOpacity }}
                className="absolute right-6 top-8 rotate-12 rounded-lg border-4 border-nope px-3 py-1 text-2xl font-extrabold text-nope"
              >
                NOPE
              </motion.span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onShowDetail(item);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                aria-label="Ver más y tráiler"
                className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-lg text-white backdrop-blur-sm"
              >
                ℹ️
              </button>
            </>
          )}

          <div className="absolute bottom-0 left-0 right-0 p-5">
            <h2 className="text-2xl font-bold leading-tight">{tmdbTitle(item)}</h2>
            <div className="mt-1 flex items-center gap-2 text-sm text-white/70">
              <span>{tmdbYear(item)}</span>
              {runtime && (
                <>
                  <span>•</span>
                  <span>{runtime}</span>
                </>
              )}
              <span>•</span>
              <span>★ {item.vote_average?.toFixed(1)}</span>
            </div>

            {(item.ratings?.imdb || item.ratings?.rottenTomatoes) && (
              <div className="mt-1.5 flex items-center gap-1.5">
                {item.ratings?.imdb && (
                  <span className="rounded bg-black/40 px-1.5 py-0.5 text-xs font-semibold text-yellow-400">
                    IMDb {item.ratings.imdb}
                  </span>
                )}
                {item.ratings?.rottenTomatoes && (
                  <span className="rounded bg-black/40 px-1.5 py-0.5 text-xs font-semibold text-red-400">
                    🍅 {item.ratings.rottenTomatoes}
                  </span>
                )}
              </div>
            )}

            <p className="mt-2 line-clamp-2 text-sm text-white/80">{item.overview}</p>

            {item.providers?.flatrate && item.providers.flatrate.length > 0 && (
              <div className="mt-3 flex items-center gap-2">
                {item.providers.flatrate.slice(0, 5).map((provider) => {
                  const logo = tmdbImageUrl(provider.logo_path, 'w92');
                  if (!logo) return null;
                  return (
                    <Image
                      key={provider.provider_id}
                      src={logo}
                      alt={provider.provider_name}
                      title={provider.provider_name}
                      width={32}
                      height={32}
                      className="rounded-lg border border-white/10"
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    );
  }
);

SwipeCard.displayName = 'SwipeCard';
