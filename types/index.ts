export type MediaType = 'movie' | 'tv';
export type Vote = 'like' | 'dislike';
export type RoomStatus = 'active' | 'closed';

export interface RoomFilters {
  genreIds: number[] | null;
  decade: number | null;
  providerIds: number[] | null;
}

export interface Room {
  id: string;
  created_at: string;
  status: RoomStatus;
  type: MediaType;
  name: string | null;
  genre_ids: number[] | null;
  decade: number | null;
  provider_ids: number[] | null;
  filters: RoomFilters | null;
}

export interface Participant {
  id: string;
  room_id: string;
  nickname: string;
  created_at: string;
}

export interface Swipe {
  id: string;
  room_id: string;
  participant_id: string;
  tmdb_id: number;
  vote: Vote;
  created_at: string;
}

export interface MatchRow {
  id: string;
  room_id: string;
  tmdb_id: number;
  created_at: string;
  watched: boolean;
}

export interface TMDBGenre {
  id: number;
  name: string;
}

export interface TMDBWatchProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string;
  display_priority?: number;
}

export interface TMDBWatchProviders {
  link: string | null;
  flatrate: TMDBWatchProvider[];
  rent: TMDBWatchProvider[];
  buy: TMDBWatchProvider[];
}

export interface ExternalRatings {
  imdb: string | null;
  rottenTomatoes: string | null;
}

export interface TMDBItem {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average: number;
  runtime?: number | null;
  episode_run_time?: number[];
  genre_ids?: number[];
  genres?: TMDBGenre[];
  providers?: TMDBWatchProviders | null;
  ratings?: ExternalRatings | null;
  cast?: string[];
  director?: string | null;
  trailerKey?: string | null;
}

export interface LocalParticipant {
  id: string;
  nickname: string;
}

export interface SavedRoom {
  roomId: string;
  roomCode: string;
  roomName: string;
  lastAccess: string;
}
