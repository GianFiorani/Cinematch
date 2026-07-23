export type MediaType = 'movie' | 'tv';
export type Vote = 'like' | 'dislike';
export type RoomStatus = 'active' | 'closed';

export interface Room {
  id: string;
  created_at: string;
  status: RoomStatus;
  type: MediaType;
  genre_id: number | null;
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
}

export interface TMDBGenre {
  id: number;
  name: string;
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
}

export interface LocalParticipant {
  id: string;
  nickname: string;
}
