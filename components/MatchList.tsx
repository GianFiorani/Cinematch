'use client';

import Image from 'next/image';
import { tmdbImageUrl, tmdbTitle, tmdbYear } from '@/lib/tmdb';
import type { MatchRow, TMDBItem } from '@/types';

interface MatchListProps {
  matches: MatchRow[];
  itemCache: Record<number, TMDBItem>;
}

export function MatchList({ matches, itemCache }: MatchListProps) {
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
                className="flex items-center gap-3 rounded-2xl border border-white/10 bg-brand-surface p-3"
              >
                <div className="relative h-20 w-14 flex-shrink-0 overflow-hidden rounded-lg bg-black/30">
                  {poster && <Image src={poster} alt={item ? tmdbTitle(item) : ''} fill className="object-cover" />}
                </div>
                <div>
                  <p className="font-semibold">{item ? tmdbTitle(item) : `Título #${match.tmdb_id}`}</p>
                  <p className="text-sm text-white/50">{item ? tmdbYear(item) : ''}</p>
                </div>
              </li>
            );
          })}
      </ul>
    </div>
  );
}
