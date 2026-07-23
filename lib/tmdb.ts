import type { MediaType, TMDBGenre, TMDBItem } from '@/types';

const IMAGE_BASE = 'https://image.tmdb.org/t/p';

export function tmdbImageUrl(path: string | null, size: 'w342' | 'w500' | 'w780' = 'w500') {
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
  genreId: number | null,
  page = 1
): Promise<TMDBItem[]> {
  const params = new URLSearchParams({ mode: 'discover', type, page: String(page) });
  if (genreId) params.set('genre', String(genreId));
  const res = await fetch(`/api/tmdb?${params.toString()}`);
  if (!res.ok) throw new Error('No se pudo cargar el catálogo de TMDB');
  const data = await res.json();
  return data.results as TMDBItem[];
}

export async function fetchItem(type: MediaType, id: number): Promise<TMDBItem | null> {
  const res = await fetch(`/api/tmdb?mode=item&type=${type}&id=${id}`);
  if (!res.ok) return null;
  return (await res.json()) as TMDBItem;
}
