'use client';

import { useEffect, useRef, useState } from 'react';
import { SwipeCard, type SwipeCardHandle } from './SwipeCard';
import { DetailModal } from './DetailModal';
import { fetchItem } from '@/lib/tmdb';
import type { MediaType, TMDBItem, Vote } from '@/types';

interface SwipeDeckProps {
  items: TMDBItem[];
  type: MediaType;
  onVote: (item: TMDBItem, vote: Vote) => void;
  onTopItemChange?: (item: TMDBItem | null) => void;
}

export function SwipeDeck({ items, type, onVote, onTopItemChange }: SwipeDeckProps) {
  const [index, setIndex] = useState(0);
  const topRef = useRef<SwipeCardHandle>(null);
  const [detailItem, setDetailItem] = useState<TMDBItem | null>(null);
  const [detailFull, setDetailFull] = useState<TMDBItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const visible = items.slice(index, index + 3);
  const topItem = visible[0] ?? null;

  useEffect(() => {
    onTopItemChange?.(topItem);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topItem?.id]);

  function handleSwiped(item: TMDBItem, vote: Vote) {
    onVote(item, vote);
    setIndex((i) => i + 1);
  }

  function triggerSwipe(vote: Vote) {
    topRef.current?.swipe(vote);
  }

  async function handleShowDetail(item: TMDBItem) {
    setDetailItem(item);
    setDetailFull(null);
    setDetailLoading(true);
    const full = await fetchItem(type, item.id);
    setDetailFull(full);
    setDetailLoading(false);
  }

  function handleCloseDetail() {
    setDetailItem(null);
    setDetailFull(null);
  }

  if (visible.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center text-white/50">
        <p className="text-lg font-semibold text-white/80">¡Ya viste todo el catálogo! 🎬</p>
        <p className="mt-1 text-sm">Esperá los matches o volvé a entrar más tarde para ver contenido nuevo.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col px-5 pt-4">
      <div className="relative flex-1">
        {visible.map((item, i) => (
          <SwipeCard
            key={item.id}
            ref={i === 0 ? topRef : undefined}
            item={item}
            isTop={i === 0}
            stackIndex={i}
            onSwiped={(vote) => handleSwiped(item, vote)}
            onShowDetail={handleShowDetail}
          />
        ))}
      </div>

      <div className="flex items-center justify-center gap-8 py-6">
        <button
          onClick={() => triggerSwipe('dislike')}
          aria-label="No me interesa"
          className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-nope bg-brand-surface text-3xl text-nope shadow-lg transition-transform active:scale-90"
        >
          ✕
        </button>
        <button
          onClick={() => triggerSwipe('like')}
          aria-label="Me gusta"
          className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-like bg-brand-surface text-3xl text-like shadow-lg transition-transform active:scale-90"
        >
          ♥
        </button>
      </div>

      <DetailModal item={detailItem} detail={detailFull} loading={detailLoading} onClose={handleCloseDetail} />
    </div>
  );
}
