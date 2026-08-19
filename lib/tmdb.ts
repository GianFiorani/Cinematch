import type { DiscoverQuery, MediaType, Room, RoomFilters, TMDBGenre, TMDBItem, TMDBWatchProvider } from '@/types';

const IMAGE_BASE = 'https://image.tmdb.org/t/p';

// -1 is a sentinel for "classics / pre-1970s" (no lower bound, just an upper one).
// It can't be 0: several call sites use `if (decade)` truthiness checks, and 0 is falsy.
export const CLASSICS_DECADE = -1;

export const DECADES: { value: number | null; label: string }[] = [
  { value: null, label: 'Todas' },
  { value: CLASSICS_DECADE, label: 'Clásicos (pre-70s)' },
  { value: 1970, label: '70s' },
  { value: 1980, label: '80s' },
  { value: 1990, label: '90s' },
  { value: 2000, label: '2000s' },
  { value: 2010, label: '2010s' },
  { value: 2020, label: '2020s' },
];

export function tmdbImageUrl(
  path: string | null,
  size: 'w45' | 'w92' | 'w342' | 'w500' | 'w780' = 'w500'
) {
  if (!path) return null;
  return `${IMAGE_BASE}/${size}${path}`;
}

export function tmdbTitle(item: TMDBItem) {
  return item.title ?? (item as unknown as { name?: string }).name ?? 'Sin título';
}

export function tmdbYear(item: TMDBItem) {
  const date = item.release_date || item.first_air_date;
  return date ? date.slice(0, 4) : '—';
}

export function tmdbRuntime(item: TMDBItem) {
  if (item.runtime) return `${item.runtime} min`;
  if (item.episode_run_time && item.episode_run_time.length > 0) {
    return `${item.episode_run_time[0]} min/ep`;
  }
  return null;
}

export async function fetchGenres(type: MediaType): Promise<TMDBGenre[]> {
  const res = await fetch(`/api/tmdb?mode=genres&type=${type}`);
  if (!res.ok) throw new Error('No se pudieron cargar los géneros');
  const data = await res.json();
  return data.genres as TMDBGenre[];
}

export interface DiscoverPage {
  results: TMDBItem[];
  totalPages: number;
}

export async function fetchDiscover(
  type: MediaType,
  query: DiscoverQuery,
  page = 1
): Promise<DiscoverPage> {
  const params = new URLSearchParams({ mode: 'discover', type, page: String(page) });
  if (query.genreIds && query.genreIds.length > 0) params.set('genre', query.genreIds.join(','));
  if (query.decade) params.set('decade', String(query.decade));
  if (query.providerIds && query.providerIds.length > 0) {
    params.set('provider', query.providerIds.join(','));
  }
  if (query.sortBy) params.set('sortBy', query.sortBy);
  if (query.runtimeLte) params.set('runtimeLte', String(query.runtimeLte));
  if (query.voteAverageGte) params.set('voteAverageGte', String(query.voteAverageGte));
  if (query.voteCountGte) params.set('voteCountGte', String(query.voteCountGte));
  if (query.voteCountLte) params.set('voteCountLte', String(query.voteCountLte));
  const res = await fetch(`/api/tmdb?${params.toString()}`);
  if (!res.ok) throw new Error('No se pudo cargar el catálogo de TMDB');
  const data = await res.json();
  return { results: data.results as TMDBItem[], totalPages: data.totalPages as number };
}

// Rooms created before the collaborative-filters feature have `filters: null` — fall back to
// the original per-column values so they keep working exactly as before, unmigrated.
export function resolveRoomFilters(room: Room): RoomFilters {
  return room.filters ?? { genreIds: room.genre_ids, decade: room.decade, providerIds: room.provider_ids };
}

export type PresetKey = 'cortitas' | 'pochocleras' | 'joyas';

interface SituationPreset {
  key: PresetKey;
  label: string;
  // Genre ids are TMDB-namespace-specific (movie "Acción" isn't the same id as TV "Acción y
  // Aventura"), so presets that pin a genre need the room's media type to resolve correctly.
  getQuery: (type: MediaType) => DiscoverQuery;
}

export const SITUATION_PRESETS: SituationPreset[] = [
  {
    key: 'cortitas',
    label: '⚡ Cortitas',
    getQuery: () => ({ genreIds: null, decade: null, providerIds: null, runtimeLte: 100 }),
  },
  {
    key: 'pochocleras',
    label: '🍿 Pochocleras',
    getQuery: (type) => ({
      genreIds: type === 'movie' ? [28, 35] : [10759, 35],
      decade: null,
      providerIds: null,
    }),
  },
  {
    key: 'joyas',
    label: '💎 Joyas Ocultas',
    getQuery: () => ({
      genreIds: null,
      decade: null,
      providerIds: null,
      voteAverageGte: 7.5,
      voteCountGte: 50,
      voteCountLte: 1000,
      // Within the filtered pool, surface the best-rated first — sorting by popularity here
      // would just favor whatever's already mainstream among the low-vote-count survivors.
      sortBy: 'vote_average.desc',
    }),
  },
];

export async function fetchProviders(type: MediaType): Promise<TMDBWatchProvider[]> {
  const res = await fetch(`/api/tmdb?mode=providers&type=${type}`);
  if (!res.ok) throw new Error('No se pudieron cargar las plataformas');
  const data = await res.json();
  return data.providers as TMDBWatchProvider[];
}

export async function fetchItem(type: MediaType, id: number): Promise<TMDBItem | null> {
  const res = await fetch(`/api/tmdb?mode=item&type=${type}&id=${id}`);
  if (!res.ok) return null;
  return (await res.json()) as TMDBItem;
}
