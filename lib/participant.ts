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

const LAST_ROOM_KEY = 'cinematch:lastRoom';

export function getLastRoomId(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(LAST_ROOM_KEY);
}

export function setLastRoomId(roomId: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LAST_ROOM_KEY, roomId);
}

export function clearLastRoomId() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(LAST_ROOM_KEY);
}

const ONBOARDING_SEEN_KEY = 'cinematch:hasSeenOnboarding';

export function hasSeenOnboarding(): boolean {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(ONBOARDING_SEEN_KEY) === 'true';
}

export function markOnboardingSeen() {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ONBOARDING_SEEN_KEY, 'true');
}
