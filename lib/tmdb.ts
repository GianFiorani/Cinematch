import type { MediaType, TMDBGenre, TMDBItem, TMDBWatchProvider } from '@/types';

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

export async function fetchDiscover(
  type: MediaType,
  genreIds: number[] | null,
  page = 1,
  decade: number | null = null,
  providerIds: number[] | null = null
): Promise<TMDBItem[]> {
  const params = new URLSearchParams({ mode: 'discover', type, page: String(page) });
  if (genreIds && genreIds.length > 0) params.set('genre', genreIds.join(','));
  if (decade) params.set('decade', String(decade));
  if (providerIds && providerIds.length > 0) params.set('provider', providerIds.join(','));
  const res = await fetch(`/api/tmdb?${params.toString()}`);
  if (!res.ok) throw new Error('No se pudo cargar el catálogo de TMDB');
  const data = await res.json();
  return data.results as TMDBItem[];
}

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
