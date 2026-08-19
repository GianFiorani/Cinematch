'use client';

import { useState } from 'react';
import Image from 'next/image';
import clsx from 'clsx';
import { tmdbImageUrl, tmdbTitle, tmdbYear } from '@/lib/tmdb';
import { MatchSpinner } from './MatchSpinner';
import type { MatchRow, TMDBItem } from '@/types';

interface MatchListProps {
  matches: MatchRow[];
  itemCache: Record<number, TMDBItem>;
  onToggleWatched: (match: MatchRow) => void;
}

export function MatchList({ matches, itemCache, onToggleWatched }: MatchListProps) {
  const [spinnerOpen, setSpinnerOpen] = useState(false);

  if (matches.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center text-white/50">
        <p className="text-lg font-semibold text-white/80">Todavía no hay matches</p>
        <p className="mt-1 text-sm">Cuando coincidan en un "Like", va a aparecer acá.</p>
      </div>
    );
  }

  return (
    <div className="no-scrollbar flex-1 overflow-y-auto px-5 py-4">
      {matches.length >= 2 && (
        <button
          onClick={() => setSpinnerOpen(true)}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-pink to-brand-orange px-5 py-3 text-sm font-bold text-white shadow-lg shadow-brand-pink/20 transition-transform active:scale-95"
        >
          🎲 Sortear qué ver hoy
        </button>
      )}
      <ul className="flex flex-col gap-3">
        {matches
          .slice()
          .reverse()
          .map((match) => {
            const item = itemCache[match.tmdb_id];
            const poster = item ? tmdbImageUrl(item.poster_path, 'w342') : null;
            return (
              <li
                key={match.id}
                className={clsx(
                  'flex items-center gap-3 rounded-2xl border border-white/10 bg-brand-surface p-3',
                  match.watched && 'opacity-60'
                )}
              >
                <div className="relative h-20 w-14 flex-shrink-0 overflow-hidden rounded-lg bg-black/30">
                  {poster && <Image src={poster} alt={item ? tmdbTitle(item) : ''} fill className="object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{item ? tmdbTitle(item) : `Título #${match.tmdb_id}`}</p>
                  <p className="text-sm text-white/50">{item ? tmdbYear(item) : ''}</p>
                </div>
                <button
                  onClick={() => onToggleWatched(match)}
                  className={clsx(
                    'shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                    match.watched
                      ? 'border-white/15 bg-white/10 text-white/60'
                      : 'border-transparent bg-gradient-to-r from-brand-pink to-brand-orange text-white'
                  )}
                >
                  {match.watched ? 'Vista ✓' : 'Guardada para después'}
                </button>
              </li>
            );
          })}
      </ul>

      <MatchSpinner
        open={spinnerOpen}
        matches={matches}
        itemCache={itemCache}
        onClose={() => setSpinnerOpen(false)}
      />
    </div>
  );
}
