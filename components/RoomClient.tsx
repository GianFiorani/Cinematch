'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { supabase } from '@/lib/supabase';
import { fetchDiscover, fetchItem, resolveRoomFilters } from '@/lib/tmdb';
import {
  getLocalParticipant,
  getSeenMovieIds,
  hasSeenOnboarding,
  markMovieSeen,
  markOnboardingSeen,
  upsertSavedRoom,
} from '@/lib/participant';
import { NicknameGate } from './NicknameGate';
import { SwipeDeck } from './SwipeDeck';
import { MatchModal } from './MatchModal';
import { MatchList } from './MatchList';
import { FiltersDrawer } from './FiltersDrawer';
import { AmbientGlow } from './AmbientGlow';
import { OnboardingModal } from './OnboardingModal';
import { QRCode } from './ui/QRCode';
import { Spinner } from './ui/Spinner';
import type { LocalParticipant, MatchRow, Room, RoomFilters, TMDBItem, Vote } from '@/types';

type LoadState = 'loading' | 'ready' | 'not-found';
type Tab = 'swipe' | 'matches';

export function RoomClient({ roomId }: { roomId: string }) {
  const router = useRouter();
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
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Pagination bookkeeping for the background "top up the deck" fetch below. Refs, not state:
  // none of this needs to trigger a re-render on its own — `items.length` already does that.
  const nextPageRef = useRef(3);
  const totalPagesRef = useRef<number | null>(null);
  const excludedIdsRef = useRef<Set<number>>(new Set());
  const loadingMoreRef = useRef(false);
  const catalogLoadingRef = useRef(false);

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

  // Collaborative filters: any participant can edit them (see handleSaveFilters), and this
  // keeps every other client's `room` state in sync so the catalog-rebuild effect below
  // (keyed on `room`) fires for everyone the moment someone saves new filters.
  useEffect(() => {
    if (!room) return;
    const roomId = room.id;
    const channel = supabase
      .channel(`room:${roomId}:filters`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        (payload) => {
          setRoom(payload.new as Room);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.id]);

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
    // Set synchronously (not just via setLoadingCatalog below) so the top-up effect — which
    // runs in the same commit, right after this one — sees it immediately. Relying on the
    // `loadingCatalog` state alone left a one-render gap where it was still `false`, letting
    // the top-up effect fire an unwanted extra page fetch before the initial load even started.
    catalogLoadingRef.current = true;
    (async () => {
      setLoadingCatalog(true);
      try {
        const filters = resolveRoomFilters(room);
        const [page1, page2] = await Promise.all([
          fetchDiscover(room.type, filters, 1),
          fetchDiscover(room.type, filters, 2),
        ]);
        const { data: mySwipes } = await supabase
          .from('swipes')
          .select('tmdb_id')
          .eq('room_id', room.id)
          .eq('participant_id', participant.id);
        if (cancelled) return;

        const alreadySwiped = new Set((mySwipes ?? []).map((s) => s.tmdb_id));
        // Titles this participant marked "Ya la vi" — a personal, cross-room block list,
        // separate from this room's own swipe history.
        const seenMovies = new Set(getSeenMovieIds());
        const seen = new Set<number>();
        const combined = [...page1.results, ...page2.results].filter((item) => {
          if (seen.has(item.id) || alreadySwiped.has(item.id) || seenMovies.has(item.id)) return false;
          seen.add(item.id);
          return true;
        });
        // Everything ever handed to the deck this session stays excluded from later pages,
        // even after it's swiped away and removed from `items` — otherwise a later TMDB page
        // could hand back a title the user already voted on.
        excludedIdsRef.current = new Set([...alreadySwiped, ...seenMovies, ...combined.map((item) => item.id)]);
        totalPagesRef.current = page2.totalPages;
        nextPageRef.current = 3;
        setItems(combined);
      } finally {
        catalogLoadingRef.current = false;
        if (!cancelled) setLoadingCatalog(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [room, participant]);

  // Keep the deck topped up: once fewer than 5 cards remain, pull the next TMDB page in the
  // background so the user never runs out mid-swipe. This cascades naturally — appending even
  // one fresh item bumps `items.length`, which re-triggers this effect if still under 5.
  useEffect(() => {
    if (!room || !participant || loadingCatalog || catalogLoadingRef.current) return;
    if (items.length >= 5) return;
    if (loadingMoreRef.current) return;
    if (totalPagesRef.current !== null && nextPageRef.current > totalPagesRef.current) return;

    loadingMoreRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const page = nextPageRef.current;
        const { results, totalPages } = await fetchDiscover(room.type, resolveRoomFilters(room), page);
        if (cancelled) return;
        totalPagesRef.current = totalPages;
        nextPageRef.current = page + 1;
        const fresh = results.filter((item) => !excludedIdsRef.current.has(item.id));
        fresh.forEach((item) => excludedIdsRef.current.add(item.id));
        if (fresh.length > 0) setItems((prev) => [...prev, ...fresh]);
      } catch (err) {
        console.error('Error al pedir más películas de TMDB', err);
      } finally {
        // Always release the lock, even if this run was superseded (`cancelled`) — otherwise
        // a swipe that lands mid-fetch would permanently wedge future top-up attempts.
        loadingMoreRef.current = false;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [room, participant, loadingCatalog, items.length]);

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

  function handleMarkAsSeen(item: TMDBItem) {
    markMovieSeen(item.id);
    // Same treatment as a vote: drop it from the deck's own source of truth so it can't
    // resurface on a tab-switch remount. No swipe row is written — this participant simply
    // opts out of matching on this title, they haven't voted like/dislike on it.
    setItems((prev) => prev.filter((i) => i.id !== item.id));
  }

  function handleMarkMatchAsSeen() {
    if (activeMatch) markMovieSeen(activeMatch.id);
    setActiveMatch(null);
  }

  async function handleSaveFilters(filters: RoomFilters) {
    if (!room) return;
    const { error } = await supabase.from('rooms').update({ filters }).eq('id', room.id);
    if (error) {
      console.error('Error al guardar los filtros de la sala', error);
      return;
    }
    // The realtime subscription above will also apply this via postgres_changes, but that
    // round-trip can lag — update local state immediately so the editor's own deck rebuilds
    // right away instead of waiting on it.
    setRoom((prev) => (prev ? { ...prev, filters } : prev));
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
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/')}
            aria-label="Volver al inicio"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 bg-brand-surface text-lg"
          >
            ←
          </button>
          <div>
            <h1 className="text-lg font-bold">
              {room.type === 'movie' ? 'Películas' : 'Series'}
            </h1>
            <p className="text-xs text-white/50">
              🟢 {onlineCount} {onlineCount === 1 ? 'persona' : 'personas'} en la sala
            </p>
          </div>
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
            onClick={() => setFiltersOpen(true)}
            aria-label="Filtros de la sala"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-brand-surface text-lg"
          >
            🎛️
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
            onMarkSeen={handleMarkAsSeen}
            onTopItemChange={handleTopItemChange}
          />
        )
      ) : (
        <MatchList matches={matches} itemCache={itemCache} onToggleWatched={handleToggleWatched} />
      )}

      <MatchModal item={activeMatch} onClose={() => setActiveMatch(null)} onMarkSeen={handleMarkMatchAsSeen} />
      <OnboardingModal open={showOnboarding} onClose={() => setShowOnboarding(false)} />
      <FiltersDrawer
        open={filtersOpen}
        type={room.type}
        filters={resolveRoomFilters(room)}
        onClose={() => setFiltersOpen(false)}
        onSave={handleSaveFilters}
      />

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
