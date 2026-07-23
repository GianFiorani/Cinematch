import type { LocalParticipant } from '@/types';

const storageKey = (roomId: string) => `cinematch:participant:${roomId}`;

export function getLocalParticipant(roomId: string): LocalParticipant | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(storageKey(roomId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LocalParticipant;
  } catch {
    return null;
  }
}

export function setLocalParticipant(roomId: string, participant: LocalParticipant) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(storageKey(roomId), JSON.stringify(participant));
}
