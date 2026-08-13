'use client';

import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import { supabase } from '@/lib/supabase';
import { fetchDiscover, fetchItem } from '@/lib/tmdb';
import {
  getLocalParticipant,
  hasSeenOnboarding,
  markOnboardingSeen,
  upsertSavedRoom,
} from '@/lib/participant';
import { NicknameGate } from './NicknameGate';
import { SwipeDeck } from './SwipeDeck';
import { MatchModal } from './MatchModal';
import { MatchList } from './MatchList';
import { AmbientGlow } from './AmbientGlow';
import { OnboardingModal } from './OnboardingModal';
import { QRCode } from './ui/QRCode';
import { Spinner } from './ui/Spinner';
import type { LocalParticipant, MatchRow, Room, TMDBItem, Vote } from '@/types';

type LoadState = 'loading' | 'ready' | 'not-found';
type Tab = 'swipe' | 'matches';

export function RoomClient({ roomId }: { roomId: string }) {
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [room, setRoom] = useState<Room | null>(null);
  const [participant, setParticipant] = useState<LocalParticipant | null>(null);
  const [items, setItems] = useState<TMDBItem[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [itemCache, setItemCache] = useState<Record<number, TMDBItem>>({});
  const [activeMatch, setActiveMatch] = useState<TMDBItem | null>(null);
  const [tab, setTab] = useState<Tab>('swipe');
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [onlineCount, setOnlineCount] = useState(1);
  const [currentPoster, setCurrentPoster] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const handleTopItemChange = useCallback((item: TMDBItem | null) => {
    setCurrentPoster(item?.poster_path ?? null);
  }, []);

  useEffect(() => {
    if (!hasSeenOnboarding()) {
      setShowOnboarding(true);
      markOnboardingSeen();
    }
  }, []);

  // Load room + local participant.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from('rooms').select('*').eq('id', roomId).single();
      if (cancelled) return;
      if (error || !data) {
        setLoadState('not-found');
        return;
      }
      setRoom(data as Room);
      const existingParticipant = getLocalParticipant(roomId);
      setParticipant(existingParticipant);
      setLoadState('ready');
    })();
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  // Record/refresh this room in the "Tus Salas Guardadas" list on the home screen —
  // covers the host right after creating it, a guest right after joining, and every
  // later revisit (bumps lastAccess so recently-used rooms sort first).
  useEffect(() => {
    if (!room || !participant) return;
    upsertSavedRoom({
      roomId: room.id,
      roomCode: room.id.slice(0, 8).toUpperCase(),
      roomName: room.name ?? `Sala de ${participant.nickname}`,
      lastAccess: new Date().toISOString(),
    });
  }, [room, participant]);

  // Presence: who's actually online in the room right now (vs. everyone who ever joined).
  useEffect(() => {
    if (!room || !participant) return;

    const channel = supabase.channel(`room:${room.id}:presence`, {
      config: { presence: { key: participant.id } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        setOnlineCount(Object.keys(state).length);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ nickname: participant.nickname, online_at: new Date().toISOString() });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [room, participant]);

  // Existing matches + realtime match notifications.
  useEffect(() => {
    if (!room) return;
    let cancelled = false;

    supabase
      .from('matches')
      .select('*')
      .eq('room_id', room.id)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (!cancelled && data) setMatches(data as MatchRow[]);
      });

    const channel = supabase
      .channel(`room:${room.id}:matches`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'matches', filter: `room_id=eq.${room.id}` },
        async (payload) => {
          const newMatch = payload.new as MatchRow;
          setMatches((prev) => (prev.some((m) => m.id === newMatch.id) ? prev : [...prev, newMatch]));
          const detail = await fetchItem(room.type, newMatch.tmdb_id);
          if (detail) {
            setItemCache((prev) => ({ ...prev, [newMatch.tmdb_id]: detail }));
            setActiveMatch(detail);
          }
        }
      )
      .on(
        // Keeps "Vista"/"Guardada para después" in sync for every participant in the room,
        // not just whoever tapped the toggle.
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches', filter: `room_id=eq.${room.id}` },
        (payload) => {
          const updated = payload.new as MatchRow;
          setMatches((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [room]);

  // Fill in TMDB details for matches that arrived before this client connected.
  useEffect(() => {
    if (!room) return;
    const missing = matches.filter((m) => !itemCache[m.tmdb_id]);
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      const details = await Promise.all(missing.map((m) => fetchItem(room.type, m.tmdb_id)));
      if (cancelled) return;
      setItemCache((prev) => {
        const next = { ...prev };
        details.forEach((detail, i) => {
          if (detail) next[missing[i].tmdb_id] = detail;
        });
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [room, matches, itemCache]);

  // Build the swipe deck, skipping cards this participant already voted on.
  useEffect(() => {
    if (!room || !participant) return;
    let cancelled = false;
    (async () => {
      setLoadingCatalog(true);
      try {
        const [page1, page2] = await Promise.all([
          fetchDiscover(room.type, room.genre_ids, 1, room.decade, room.provider_ids),
          fetchDiscover(room.type, room.genre_ids, 2, room.decade, room.provider_ids),
        ]);
        const { data: mySwipes } = await supabase
          .from('swipes')
          .select('tmdb_id')
          .eq('room_id', room.id)
          .eq('participant_id', participant.id);
        if (cancelled) return;

        const alreadySwiped = new Set((mySwipes ?? []).map((s) => s.tmdb_id));
        const seen = new Set<number>();
        const combined = [...page1, ...page2].filter((item) => {
          if (seen.has(item.id) || alreadySwiped.has(item.id)) return false;
          seen.add(item.id);
          return true;
        });
        setItems(combined);
      } finally {
        if (!cancelled) setLoadingCatalog(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [room, participant]);

  async function handleVote(item: TMDBItem, vote: Vote) {
    if (!room || !participant) return;
    setItemCache((prev) => ({ ...prev, [item.id]: item }));
    // Drop the voted item from the deck's own source of truth (not just SwipeDeck's local
    // index) so it can never resurface if SwipeDeck unmounts/remounts, e.g. on a Swipe/Matches
    // tab switch.
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    const { error } = await supabase.from('swipes').insert({
      room_id: room.id,
      participant_id: participant.id,
      tmdb_id: item.id,
      vote,
    });
    if (error && error.code !== '23505') {
      console.error('Error al registrar el swipe', error);
    }
  }

  async function handleToggleWatched(match: MatchRow) {
    const nextWatched = !match.watched;
    setMatches((prev) => prev.map((m) => (m.id === match.id ? { ...m, watched: nextWatched } : m)));
    const { error } = await supabase.from('matches').update({ watched: nextWatched }).eq('id', match.id);
    if (error) {
      console.error('Error al actualizar el estado del match', error);
      setMatches((prev) => prev.map((m) => (m.id === match.id ? { ...m, watched: !nextWatched } : m)));
    }
  }

  async function handleCopyLink() {
    const url = `${window.location.origin}/room/${roomId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available; the QR code and visible link remain as a fallback.
    }
  }

  async function handleShareInvite() {
    const url = `${window.location.origin}/room/${roomId}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'CineMatch',
          text: 'Sumate a mi sala de CineMatch y elegí qué vemos 🎬',
          url,
        });
      } catch {
        // El usuario cerró el share sheet nativo sin elegir una app; no hace falta fallback.
      }
      return;
    }
    await handleCopyLink();
  }

  if (loadState === 'loading') {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (loadState === 'not-found' || !room) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <p className="text-lg font-semibold">Esta sala no existe o ya cerró 😕</p>
        <p className="mt-1 text-sm text-white/50">Pedile al host un nuevo enlace.</p>
      </div>
    );
  }

  if (!participant) {
    return (
      <>
        <NicknameGate roomId={roomId} onJoined={setParticipant} />
        <OnboardingModal open={showOnboarding} onClose={() => setShowOnboarding(false)} />
      </>
    );
  }

  const roomUrl = typeof window !== 'undefined' ? `${window.location.origin}/room/${roomId}` : '';

  return (
    <div className="flex flex-1 flex-col">
      <AmbientGlow posterPath={tab === 'swipe' ? currentPoster : null} />

      <header className="flex items-center justify-between px-5 pt-6">
        <div>
          <h1 className="text-lg font-bold">
            {room.type === 'movie' ? 'Películas' : 'Series'}
          </h1>
          <p className="text-xs text-white/50">
            🟢 {onlineCount} {onlineCount === 1 ? 'persona' : 'personas'} en la sala
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowOnboarding(true)}
            aria-label="¿Cómo funciona?"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-brand-surface text-lg"
          >
            ❓
          </button>
          <button
            onClick={() => setShareOpen(true)}
            className="rounded-full border border-white/15 bg-brand-surface px-4 py-2 text-sm font-semibold"
          >
            Invitar
          </button>
        </div>
      </header>

      <nav className="mx-5 mt-4 flex rounded-xl bg-brand-surface p-1">
        {(['swipe', 'matches'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              'flex-1 rounded-lg py-2 text-sm font-semibold transition-colors',
              tab === t ? 'bg-gradient-to-r from-brand-pink to-brand-orange text-white' : 'text-white/50'
            )}
          >
            {t === 'swipe' ? 'Swipe' : `Matches (${matches.length})`}
          </button>
        ))}
      </nav>

      {tab === 'swipe' ? (
        loadingCatalog ? (
          <div className="flex flex-1 items-center justify-center">
            <Spinner className="h-8 w-8" />
          </div>
        ) : (
          <SwipeDeck
            items={items}
            type={room.type}
            onVote={handleVote}
            onTopItemChange={handleTopItemChange}
          />
        )
      ) : (
        <MatchList matches={matches} itemCache={itemCache} onToggleWatched={handleToggleWatched} />
      )}

      <MatchModal item={activeMatch} onClose={() => setActiveMatch(null)} />
      <OnboardingModal open={showOnboarding} onClose={() => setShowOnboarding(false)} />

      {shareOpen && (
        <div
          className="fixed inset-0 z-[110] flex items-end justify-center bg-black/70"
          onClick={() => setShareOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl bg-brand-surface p-6 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-1 text-lg font-bold">Invitá a tu sala</h2>
            <p className="mb-4 text-sm text-white/50">Mandale el link a quien quieras sumar, o escaneá el QR.</p>

            <button
              onClick={handleShareInvite}
              className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-5 py-4 text-base font-bold text-white shadow-lg shadow-[#25D366]/30 transition-transform active:scale-95"
            >
              💬 {copied ? '¡Link copiado!' : 'Invitar por WhatsApp'}
            </button>

            {roomUrl && (
              <div className="mb-4 flex justify-center">
                <QRCode value={roomUrl} />
              </div>
            )}
            <p className="mb-4 break-all rounded-lg bg-black/30 px-3 py-2 text-xs text-white/60">{roomUrl}</p>
            <button
              onClick={handleCopyLink}
              className="w-full rounded-xl border border-white/15 px-5 py-3 text-sm font-semibold text-white/70"
            >
              {copied ? '¡Copiado!' : 'Copiar link'}
            </button>
            <button onClick={() => setShareOpen(false)} className="mt-3 text-sm text-white/50">
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
