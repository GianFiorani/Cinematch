'use client';

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { supabase } from '@/lib/supabase';
import { fetchDiscover, fetchItem } from '@/lib/tmdb';
import { getLocalParticipant } from '@/lib/participant';
import { NicknameGate } from './NicknameGate';
import { SwipeDeck } from './SwipeDeck';
import { MatchModal } from './MatchModal';
import { MatchList } from './MatchList';
import { QRCode } from './ui/QRCode';
import { Spinner } from './ui/Spinner';
import type { LocalParticipant, MatchRow, Participant, Room, TMDBItem, Vote } from '@/types';

type LoadState = 'loading' | 'ready' | 'not-found';
type Tab = 'swipe' | 'matches';

export function RoomClient({ roomId }: { roomId: string }) {
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [room, setRoom] = useState<Room | null>(null);
  const [participant, setParticipant] = useState<LocalParticipant | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [items, setItems] = useState<TMDBItem[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [itemCache, setItemCache] = useState<Record<number, TMDBItem>>({});
  const [activeMatch, setActiveMatch] = useState<TMDBItem | null>(null);
  const [tab, setTab] = useState<Tab>('swipe');
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);

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
      setParticipant(getLocalParticipant(roomId));
      setLoadState('ready');
    })();
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  // Participants list + realtime join updates.
  useEffect(() => {
    if (!room) return;
    let cancelled = false;

    supabase
      .from('participants')
      .select('*')
      .eq('room_id', room.id)
      .then(({ data }) => {
        if (!cancelled && data) setParticipants(data as Participant[]);
      });

    const channel = supabase
      .channel(`room:${room.id}:participants`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'participants', filter: `room_id=eq.${room.id}` },
        (payload) => {
          const newParticipant = payload.new as Participant;
          setParticipants((prev) => (prev.some((p) => p.id === newParticipant.id) ? prev : [...prev, newParticipant]));
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [room]);

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
          fetchDiscover(room.type, room.genre_id, 1),
          fetchDiscover(room.type, room.genre_id, 2),
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
    return <NicknameGate roomId={roomId} onJoined={setParticipant} />;
  }

  const roomUrl = typeof window !== 'undefined' ? `${window.location.origin}/room/${roomId}` : '';

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between px-5 pt-6">
        <div>
          <h1 className="text-lg font-bold">
            {room.type === 'movie' ? 'Películas' : 'Series'}
          </h1>
          <p className="text-xs text-white/50">
            {participants.length} {participants.length === 1 ? 'participante' : 'participantes'}
          </p>
        </div>
        <button
          onClick={() => setShareOpen(true)}
          className="rounded-full border border-white/15 bg-brand-surface px-4 py-2 text-sm font-semibold"
        >
          Invitar
        </button>
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
          <SwipeDeck items={items} onVote={handleVote} />
        )
      ) : (
        <MatchList matches={matches} itemCache={itemCache} />
      )}

      <MatchModal item={activeMatch} onClose={() => setActiveMatch(null)} />

      {shareOpen && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/70"
          onClick={() => setShareOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl bg-brand-surface p-6 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-1 text-lg font-bold">Invitá a tu sala</h2>
            <p className="mb-4 text-sm text-white/50">Compartí el link o escaneá el QR por WhatsApp.</p>
            {roomUrl && (
              <div className="mb-4 flex justify-center">
                <QRCode value={roomUrl} />
              </div>
            )}
            <p className="mb-4 break-all rounded-lg bg-black/30 px-3 py-2 text-xs text-white/60">{roomUrl}</p>
            <button
              onClick={handleCopyLink}
              className="w-full rounded-xl bg-gradient-to-r from-brand-pink to-brand-orange px-5 py-3 text-sm font-semibold"
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
