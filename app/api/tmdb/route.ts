import { NextRequest, NextResponse } from 'next/server';

const TMDB_BASE = 'https://api.themoviedb.org/3';
const LANGUAGE = 'es-ES';

function tmdbUrl(path: string, params: Record<string, string> = {}) {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) throw new Error('TMDB_API_KEY no está configurada en el servidor');
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('language', LANGUAGE);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

type MediaType = 'movie' | 'tv';

function isMediaType(value: string | null): value is MediaType {
  return value === 'movie' || value === 'tv';
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('mode');
  const typeParam = searchParams.get('type');

  if (!isMediaType(typeParam)) {
    return NextResponse.json({ error: 'type debe ser "movie" o "tv"' }, { status: 400 });
  }
  const type = typeParam;

  try {
    if (mode === 'genres') {
      const res = await fetch(tmdbUrl(`/genre/${type}/list`), {
        next: { revalidate: 86400 },
      });
      if (!res.ok) throw new Error(`TMDB respondió ${res.status}`);
      const data = await res.json();
      return NextResponse.json({ genres: data.genres });
    }

    if (mode === 'item') {
      const id = searchParams.get('id');
      if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 });
      const res = await fetch(tmdbUrl(`/${type}/${id}`), { next: { revalidate: 3600 } });
      if (!res.ok) throw new Error(`TMDB respondió ${res.status}`);
      const item = await res.json();
      return NextResponse.json(item);
    }

    if (mode === 'discover') {
      const genre = searchParams.get('genre');
      const page = searchParams.get('page') ?? '1';
      const discoverParams: Record<string, string> = {
        sort_by: 'popularity.desc',
        include_adult: 'false',
        page,
      };
      if (genre) discoverParams.with_genres = genre;

      const res = await fetch(tmdbUrl(`/discover/${type}`, discoverParams), {
        next: { revalidate: 300 },
      });
      if (!res.ok) throw new Error(`TMDB respondió ${res.status}`);
      const data = await res.json();

      const results = await Promise.all(
        (data.results ?? []).map(async (item: { id: number }) => {
          try {
            const detailRes = await fetch(tmdbUrl(`/${type}/${item.id}`), {
              next: { revalidate: 3600 },
            });
            if (!detailRes.ok) return item;
            const detail = await detailRes.json();
            return { ...item, runtime: detail.runtime, episode_run_time: detail.episode_run_time };
          } catch {
            return item;
          }
        })
      );

      return NextResponse.json({ results });
    }

    return NextResponse.json({ error: 'mode debe ser "genres", "discover" o "item"' }, { status: 400 });
  } catch (error) {
    console.error('Error en /api/tmdb', error);
    return NextResponse.json({ error: 'Error al consultar TMDB' }, { status: 502 });
  }
}
