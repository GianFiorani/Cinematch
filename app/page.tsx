'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import clsx from 'clsx';
import { supabase } from '@/lib/supabase';
import { DECADES, fetchGenres, fetchProviders, tmdbImageUrl } from '@/lib/tmdb';
import {
  getSavedRooms,
  hasSeenOnboarding,
  markOnboardingSeen,
  pruneSavedRooms,
  setLocalParticipant,
} from '@/lib/participant';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { OnboardingModal } from '@/components/OnboardingModal';
import type { MediaType, SavedRoom, TMDBGenre, TMDBWatchProvider } from '@/types';

export default function HomePage() {
  const router = useRouter();
  const [nickname, setNickname] = useState('');
  const [roomName, setRoomName] = useState('');
  const [type, setType] = useState<MediaType>('movie');
  const [genres, setGenres] = useState<TMDBGenre[]>([]);
  const [genreIds, setGenreIds] = useState<number[]>([]);
  const [decade, setDecade] = useState<number | null>(null);
  const [providers, setProviders] = useState<TMDBWatchProvider[]>([]);
  const [providerIds, setProviderIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedRooms, setSavedRooms] = useState<SavedRoom[]>([]);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (!hasSeenOnboarding()) {
      setShowOnboarding(true);
      markOnboardingSeen();
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setGenreIds([]);
    fetchGenres(type)
      .then((data) => {
        if (!cancelled) setGenres(data);
      })
      .catch(() => {
        if (!cancelled) setGenres([]);
      });
    return () => {
      cancelled = true;
    };
  }, [type]);

  useEffect(() => {
    let cancelled = false;
    setProviderIds([]);
    fetchProviders(type)
      .then((data) => {
        if (!cancelled) setProviders(data);
      })
      .catch(() => {
        if (!cancelled) setProviders([]);
      });
    return () => {
      cancelled = true;
    };
  }, [type]);

  // Load "Tus Salas Guardadas", pruning any entry whose room got closed/deleted meanwhile.
  useEffect(() => {
    const saved = getSavedRooms();
    if (saved.length === 0) return;
    let cancelled = false;
    supabase
      .from('rooms')
      .select('id')
      .in('id', saved.map((r) => r.roomId))
      .eq('status', 'active')
      .then(({ data }) => {
        if (cancelled) return;
        const activeIds = (data ?? []).map((r) => r.id as string);
        setSavedRooms(pruneSavedRooms(activeIds));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function toggleGenre(id: number) {
    setGenreIds((prev) => (prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]));
  }

  function toggleProvider(id: number) {
    setProviderIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  }

  async function handleCreateRoom() {
    setLoading(true);
    setError(null);
    try {
      const finalNickname = nickname.trim() || 'Host';
      const finalRoomName = roomName.trim() || `Sala de ${finalNickname}`;

      const { data: room, error: roomError } = await supabase
        .from('rooms')
        .insert({
          type,
          name: finalRoomName,
          genre_ids: genreIds.length > 0 ? genreIds : null,
          decade,
          provider_ids: providerIds.length > 0 ? providerIds : null,
        })
        .select()
        .single();

      if (roomError || !room) throw roomError ?? new Error('No se pudo crear la sala');

      const participantId = crypto.randomUUID();

      const { error: participantError } = await supabase.from('participants').insert({
        id: participantId,
        room_id: room.id,
        nickname: finalNickname,
      });

      if (participantError) throw participantError;

      setLocalParticipant(room.id, { id: participantId, nickname: finalNickname });
      router.push(`/room/${room.id}`);
    } catch (err) {
      console.error(err);
      setError('No pudimos crear la sala. Probá de nuevo en unos segundos.');
      setLoading(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col justify-between px-6 pb-10 pt-16">
      <div>
        <div className="mb-10 text-center">
          <h1 className="bg-gradient-to-r from-brand-pink to-brand-orange bg-clip-text text-4xl font-extrabold text-transparent">
            CineMatch
          </h1>
          <p className="mt-2 text-sm text-white/60">
            Swipeá con tu pareja o amigos y encontrá algo que a todos les copa mirar.
          </p>
          <button
            onClick={() => setShowOnboarding(true)}
            className="mt-3 rounded-full border border-white/15 bg-brand-surface px-4 py-2 text-sm font-semibold text-white/80"
          >
            ❓ ¿Cómo funciona?
          </button>
        </div>

        {savedRooms.length > 0 && (
          <div className="mb-6">
            <span className="mb-2 block text-sm font-medium text-white/70">Tus Salas Guardadas</span>
            <div className="flex flex-col gap-2">
              {savedRooms.map((saved) => (
                <button
                  key={saved.roomId}
                  onClick={() => router.push(`/room/${saved.roomId}`)}
                  className="flex w-full items-center justify-between rounded-xl border border-brand-pink/40 bg-brand-surface px-4 py-3 text-left"
                >
                  <span>
                    <span className="block text-sm font-semibold text-white">{saved.roomName}</span>
                    <span className="block text-xs text-white/50">Código {saved.roomCode}</span>
                  </span>
                  <span className="text-brand-pink">→</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <label className="mb-6 block">
          <span className="mb-2 block text-sm font-medium text-white/70">Nombre de la sala (opcional)</span>
          <input
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            maxLength={40}
            placeholder="Ej: Peli night del viernes"
            className="w-full rounded-xl border border-white/10 bg-brand-surface px-4 py-3 text-white placeholder:text-white/30 focus:border-brand-pink focus:outline-none"
          />
        </label>

        <label className="mb-6 block">
          <span className="mb-2 block text-sm font-medium text-white/70">Tu apodo (opcional)</span>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={24}
            placeholder="Ej: Gian"
            className="w-full rounded-xl border border-white/10 bg-brand-surface px-4 py-3 text-white placeholder:text-white/30 focus:border-brand-pink focus:outline-none"
          />
        </label>

        <div className="mb-6">
          <span className="mb-2 block text-sm font-medium text-white/70">¿Qué quieren ver?</span>
          <div className="grid grid-cols-2 gap-3">
            {(['movie', 'tv'] as MediaType[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setType(option)}
                className={clsx(
                  'rounded-xl border px-4 py-3 text-sm font-semibold transition-colors',
                  type === option
                    ? 'border-transparent bg-gradient-to-r from-brand-pink to-brand-orange text-white'
                    : 'border-white/10 bg-brand-surface text-white/60'
                )}
              >
                {option === 'movie' ? 'Películas' : 'Series'}
              </button>
            ))}
          </div>
        </div>

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
                      : 'border-white/10 bg-brand-surface text-white/60'
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
                      : 'border-white/10 bg-brand-surface text-white/60'
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
              const logo = tmdbImageUrl(provider.logo_path, 'w45');
              return (
                <button
                  key={provider.provider_id}
                  type="button"
                  onClick={() => toggleProvider(provider.provider_id)}
                  className={clsx(
                    'flex items-center gap-2 rounded-full border pl-2 pr-3 py-1.5 text-sm font-medium transition-colors',
                    active
                      ? 'border-transparent bg-gradient-to-r from-brand-pink to-brand-orange text-white'
                      : 'border-white/10 bg-brand-surface text-white/60'
                  )}
                >
                  {logo && (
                    <Image
                      src={logo}
                      alt=""
                      width={20}
                      height={20}
                      className="rounded-full"
                    />
                  )}
                  {provider.provider_name}
                </button>
              );
            })}
          </div>
        </div>

        {error && <p className="mb-4 text-sm text-nope">{error}</p>}
      </div>

      <Button onClick={handleCreateRoom} disabled={loading} className="w-full">
        {loading ? <Spinner /> : 'Crear Sala'}
      </Button>

      <OnboardingModal open={showOnboarding} onClose={() => setShowOnboarding(false)} />
    </main>
  );
}
