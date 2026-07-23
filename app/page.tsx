'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { supabase } from '@/lib/supabase';
import { fetchGenres } from '@/lib/tmdb';
import { setLocalParticipant } from '@/lib/participant';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import type { MediaType, TMDBGenre } from '@/types';

export default function HomePage() {
  const router = useRouter();
  const [nickname, setNickname] = useState('');
  const [type, setType] = useState<MediaType>('movie');
  const [genres, setGenres] = useState<TMDBGenre[]>([]);
  const [genreId, setGenreId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setGenreId('');
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

  async function handleCreateRoom() {
    setLoading(true);
    setError(null);
    try {
      const { data: room, error: roomError } = await supabase
        .from('rooms')
        .insert({
          type,
          genre_id: genreId ? Number(genreId) : null,
        })
        .select()
        .single();

      if (roomError || !room) throw roomError ?? new Error('No se pudo crear la sala');

      const participantId = crypto.randomUUID();
      const finalNickname = nickname.trim() || 'Host';

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
        </div>

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

        <label className="mb-6 block">
          <span className="mb-2 block text-sm font-medium text-white/70">Género (opcional)</span>
          <select
            value={genreId}
            onChange={(e) => setGenreId(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-brand-surface px-4 py-3 text-white focus:border-brand-pink focus:outline-none"
          >
            <option value="">Todos los géneros</option>
            {genres.map((genre) => (
              <option key={genre.id} value={genre.id}>
                {genre.name}
              </option>
            ))}
          </select>
        </label>

        {error && <p className="mb-4 text-sm text-nope">{error}</p>}
      </div>

      <Button onClick={handleCreateRoom} disabled={loading} className="w-full">
        {loading ? <Spinner /> : 'Crear Sala'}
      </Button>
    </main>
  );
}
