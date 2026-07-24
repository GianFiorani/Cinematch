import { NextRequest, NextResponse } from 'next/server';

const TMDB_BASE = 'https://api.themoviedb.org/3';
const LANGUAGE = 'es-ES';
const WATCH_REGION = 'AR';

interface TMDBWatchProvidersResponse {
  results?: Record<
    string,
    {
      link?: string;
      flatrate?: unknown[];
      rent?: unknown[];
      buy?: unknown[];
    }
  >;
}

function extractProviders(detail: { 'watch/providers'?: TMDBWatchProvidersResponse }) {
  const regionData = detail['watch/providers']?.results?.[WATCH_REGION];
  if (!regionData) return null;
  return {
    link: regionData.link ?? null,
    flatrate: regionData.flatrate ?? [],
    rent: regionData.rent ?? [],
    buy: regionData.buy ?? [],
  };
}

function extractImdbId(detail: { imdb_id?: string | null; external_ids?: { imdb_id?: string | null } }) {
  return detail.external_ids?.imdb_id ?? detail.imdb_id ?? null;
}

function extractCredits(detail: {
  credits?: { cast?: Array<{ name: string }>; crew?: Array<{ name: string; job: string }> };
}) {
  const cast = (detail.credits?.cast ?? []).slice(0, 5).map((c) => c.name);
  const director = detail.credits?.crew?.find((c) => c.job === 'Director')?.name ?? null;
  return { cast, director };
}

function findTrailerKey(videos: {
  results?: Array<{ site: string; type: string; key: string; official?: boolean }>;
}) {
  const youtube = (videos.results ?? []).filter((v) => v.site === 'YouTube');
  const trailer =
    youtube.find((v) => v.type === 'Trailer' && v.official) ??
    youtube.find((v) => v.type === 'Trailer') ??
    youtube.find((v) => v.type === 'Teaser');
  return trailer?.key ?? null;
}

const OMDB_BASE = 'https://www.omdbapi.com/';

async function fetchOmdbRatings(imdbId: string | null) {
  if (!imdbId) return null;
  const apiKey = process.env.OMDB_API_KEY;
  if (!apiKey) return null;

  try {
    const url = new URL(OMDB_BASE);
    url.searchParams.set('apikey', apiKey);
    url.searchParams.set('i', imdbId);
    const res = await fetch(url.toString(), { next: { revalidate: 86400 } });
    if (!res.ok) return null;

    const data = await res.json();
    if (data.Response === 'False') return null;

    const rottenTomatoes = (data.Ratings ?? []).find(
      (rating: { Source: string; Value: string }) => rating.Source === 'Rotten Tomatoes'
    );

    return {
      imdb: data.imdbRating && data.imdbRating !== 'N/A' ? data.imdbRating : null,
      rottenTomatoes: rottenTomatoes?.Value ?? null,
    };
  } catch {
    return null;
  }
}

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

      const [res, videosRes] = await Promise.all([
        fetch(
          tmdbUrl(`/${type}/${id}`, { append_to_response: 'watch/providers,external_ids,credits' }),
          { next: { revalidate: 3600 } }
        ),
        // Trailers are fetched in en-US: TMDB's video catalog for most titles is far more
        // complete in English than in es-ES, and a missing trailer is worse than one with
        // English title cards.
        fetch(tmdbUrl(`/${type}/${id}/videos`, { language: 'en-US' }), {
          next: { revalidate: 3600 },
        }),
      ]);
      if (!res.ok) throw new Error(`TMDB respondió ${res.status}`);
      const detail = await res.json();
      const videos = videosRes.ok ? await videosRes.json() : { results: [] };

      const providers = extractProviders(detail);
      const ratings = await fetchOmdbRatings(extractImdbId(detail));
      const { cast, director } = extractCredits(detail);
      const trailerKey = findTrailerKey(videos);

      delete detail['watch/providers'];
      delete detail.external_ids;
      delete detail.credits;

      return NextResponse.json({ ...detail, providers, ratings, cast, director, trailerKey });
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
            const detailRes = await fetch(
              tmdbUrl(`/${type}/${item.id}`, { append_to_response: 'watch/providers,external_ids' }),
              { next: { revalidate: 3600 } }
            );
            if (!detailRes.ok) return item;
            const detail = await detailRes.json();
            const ratings = await fetchOmdbRatings(extractImdbId(detail));
            return {
              ...item,
              runtime: detail.runtime,
              episode_run_time: detail.episode_run_time,
              providers: extractProviders(detail),
              ratings,
            };
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
