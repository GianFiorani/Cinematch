'use client';

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { DECADES, fetchGenres, fetchProviders } from '@/lib/tmdb';
import { Button } from './ui/Button';
import { Spinner } from './ui/Spinner';
import type { MediaType, RoomFilters, TMDBGenre, TMDBWatchProvider } from '@/types';

interface FiltersDrawerProps {
  open: boolean;
  type: MediaType;
  filters: RoomFilters;
  onClose: () => void;
  onSave: (filters: RoomFilters) => Promise<void>;
}

export function FiltersDrawer({ open, type, filters, onClose, onSave }: FiltersDrawerProps) {
  const [genres, setGenres] = useState<TMDBGenre[]>([]);
  const [providers, setProviders] = useState<TMDBWatchProvider[]>([]);
  const [genreIds, setGenreIds] = useState<number[]>(filters.genreIds ?? []);
  const [decade, setDecade] = useState<number | null>(filters.decade);
  const [providerIds, setProviderIds] = useState<number[]>(filters.providerIds ?? []);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetchGenres(type)
      .then(setGenres)
      .catch(() => setGenres([]));
    fetchProviders(type)
      .then(setProviders)
      .catch(() => setProviders([]));
  }, [open, type]);

  // Re-sync local edit state with the room's current filters every time the drawer opens,
  // so it doesn't show stale edits from a previous open (or from another participant's save).
  useEffect(() => {
    if (!open) return;
    setGenreIds(filters.genreIds ?? []);
    setDecade(filters.decade);
    setProviderIds(filters.providerIds ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function toggleGenre(id: number) {
    setGenreIds((prev) => (prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]));
  }

  function toggleProvider(id: number) {
    setProviderIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({
        genreIds: genreIds.length > 0 ? genreIds : null,
        decade,
        providerIds: providerIds.length > 0 ? providerIds : null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/70" onClick={onClose}>
      <div
        className="no-scrollbar max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-brand-surface p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-lg font-bold">Filtros de la sala</h2>
        <p className="mb-4 text-sm text-white/50">
          Se aplican para todos los participantes y el mazo se reinicia al guardar.
        </p>

        <div className="mb-6">
          <span className="mb-2 block text-sm font-medium text-white/70">
            Géneros (opcional{genreIds.length > 0 ? ` · ${genreIds.length} elegidos` : ''})
          </span>
          <div className="flex flex-wrap gap-2">
            {genres.map((genre) => {
              const active = genreIds.includes(genre.id);
              return (
                <button
                  key={genre.id}
                  type="button"
                  onClick={() => toggleGenre(genre.id)}
                  className={clsx(
                    'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                    active
                      ? 'border-transparent bg-gradient-to-r from-brand-pink to-brand-orange text-white'
                      : 'border-white/10 bg-brand-dark text-white/60'
                  )}
                >
                  {genre.name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mb-6">
          <span className="mb-2 block text-sm font-medium text-white/70">Década (opcional)</span>
          <div className="flex flex-wrap gap-2">
            {DECADES.map((option) => {
              const active = decade === option.value;
              return (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => setDecade(option.value)}
                  className={clsx(
                    'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                    active
                      ? 'border-transparent bg-gradient-to-r from-brand-pink to-brand-orange text-white'
                      : 'border-white/10 bg-brand-dark text-white/60'
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mb-6">
          <span className="mb-2 block text-sm font-medium text-white/70">
            Plataformas (opcional{providerIds.length > 0 ? ` · ${providerIds.length} elegidas` : ''})
          </span>
          <div className="flex flex-wrap gap-2">
            {providers.map((provider) => {
              const active = providerIds.includes(provider.provider_id);
              return (
                <button
                  key={provider.provider_id}
                  type="button"
                  onClick={() => toggleProvider(provider.provider_id)}
                  className={clsx(
                    'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                    active
                      ? 'border-transparent bg-gradient-to-r from-brand-pink to-brand-orange text-white'
                      : 'border-white/10 bg-brand-dark text-white/60'
                  )}
                >
                  {provider.provider_name}
                </button>
              );
            })}
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving ? <Spinner /> : 'Guardar filtros'}
        </Button>
        <button onClick={onClose} className="mt-3 w-full text-sm text-white/50">
          Cancelar
        </button>
      </div>
    </div>
  );
}
