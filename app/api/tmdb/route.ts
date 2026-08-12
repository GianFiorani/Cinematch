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

// TMDB's own es-ES translations are missing for a handful of TV-specific genres
// (these composite/English-only categories aren't part of the movie genre list).
// We patch just these known gaps rather than leaving the UI half-English.
const TV_GENRE_ES_OVERRIDES: Record<number, string> = {
  10759: 'Acción y Aventura',
  10762: 'Infantil',
  10763: 'Noticias',
  10764: 'Telerrealidad',
  10765: 'Ciencia Ficción y Fantasía',
  10766: 'Telenovela',
  10767: 'Programa de Entrevistas',
  10768: 'Guerra y Política',
};

// The 6 major streaming platforms we offer as filter chips. We match TMDB's live
// watch/providers list by name (case-insensitive) instead of hardcoding provider_ids:
// those ids are stable per-platform but the display name/rebrand (e.g. HBO Max -> Max)
// has changed before, and matching by name self-heals across those rebrands.
const CURATED_PROVIDERS: { key: string; names: string[] }[] = [
  { key: 'netflix', names: ['netflix'] },
  { key: 'prime', names: ['amazon prime video', 'prime video'] },
  { key: 'max', names: ['max', 'hbo max'] },
  { key: 'disney', names: ['disney plus', 'disney+'] },
  { key: 'paramount', names: ['paramount plus', 'paramount+'] },
  // TMDB lists this one simply as "Apple TV" in the AR region (not "Apple TV Plus"/"Apple TV+").
  // The match is exact-string, so this can't accidentally catch "Apple TV Store" or the
  // various "... Apple TV Channel" rental add-ons that also show up in the same list.
  { key: 'appletv', names: ['apple tv plus', 'apple tv+', 'apple tv'] },
];

interface TMDBProviderListEntry {
  provider_id: number;
  provider_name: string;
  logo_path: string;
  display_priority?: number;
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
      const genres: { id: number; name: string }[] =
        type === 'tv'
          ? data.genres.map((g: { id: number; name: string }) => ({
              ...g,
              name: TV_GENRE_ES_OVERRIDES[g.id] ?? g.name,
            }))
          : data.genres;
      return NextResponse.json({ genres });
    }

    if (mode === 'providers') {
      const region = searchParams.get('region') || WATCH_REGION;
      const res = await fetch(tmdbUrl(`/watch/providers/${type}`, { watch_region: region }), {
        next: { revalidate: 86400 },
      });
      if (!res.ok) throw new Error(`TMDB respondió ${res.status}`);
      const data = await res.json();
      const results: TMDBProviderListEntry[] = data.results ?? [];

      const providers = CURATED_PROVIDERS.map(({ names }) => {
        const match = results.find((r) => names.includes(r.provider_name.toLowerCase()));
        return match
          ? {
              provider_id: match.provider_id,
              provider_name: match.provider_name,
              logo_path: match.logo_path,
            }
          : null;
      }).filter((p): p is NonNullable<typeof p> => p !== null);

      return NextResponse.json({ providers });
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
      const decade = searchParams.get('decade');
      const provider = searchParams.get('provider');
      const region = searchParams.get('region') || WATCH_REGION;
      const discoverParams: Record<string, string> = {
        sort_by: 'popularity.desc',
        include_adult: 'false',
        page,
      };
      // Same AND/OR nuance as with_genres: TMDB needs pipe-separated ids for "any of these
      // platforms", and watch_region is required for with_watch_providers to take effect at all.
      if (provider) {
        discoverParams.with_watch_providers = provider.split(',').join('|');
        discoverParams.watch_region = region;
      }
      // TMDB treats comma-separated genre ids as AND (must match all) and pipe-separated as
      // OR (match any). Our own `genre` query param stays a plain comma-separated list; we
      // only translate it to TMDB's OR syntax right here, at the boundary.
      if (genre) discoverParams.with_genres = genre.split(',').join('|');
      if (decade) {
        const startYear = Number(decade);
        const dateField = type === 'movie' ? 'primary_release_date' : 'first_air_date';
        if (startYear === -1) {
          // "Clásicos / pre-70s": upper bound only, no lower bound.
          discoverParams[`${dateField}.lte`] = '1969-12-31';
        } else {
          discoverParams[`${dateField}.gte`] = `${startYear}-01-01`;
          discoverParams[`${dateField}.lte`] = `${startYear + 9}-12-31`;
        }
      }

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
