import type { LocalParticipant, SavedRoom } from '@/types';

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

const SAVED_ROOMS_KEY = 'cinematch:saved_rooms';

export function getSavedRooms(): SavedRoom[] {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(SAVED_ROOMS_KEY);
  if (!raw) return [];
  try {
    const rooms = JSON.parse(raw) as SavedRoom[];
    return [...rooms].sort((a, b) => b.lastAccess.localeCompare(a.lastAccess));
  } catch {
    return [];
  }
}

export function upsertSavedRoom(entry: SavedRoom) {
  if (typeof window === 'undefined') return;
  const rooms = getSavedRooms().filter((r) => r.roomId !== entry.roomId);
  rooms.unshift(entry);
  window.localStorage.setItem(SAVED_ROOMS_KEY, JSON.stringify(rooms));
}

// Drops saved-room entries that no longer point to an active room (closed/deleted),
// so "Tus Salas Guardadas" never shows dead links.
export function pruneSavedRooms(validRoomIds: string[]): SavedRoom[] {
  if (typeof window === 'undefined') return [];
  const pruned = getSavedRooms().filter((r) => validRoomIds.includes(r.roomId));
  window.localStorage.setItem(SAVED_ROOMS_KEY, JSON.stringify(pruned));
  return pruned;
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

const DISMISS_INSTALL_BANNER_KEY = 'cinematch:dismiss_install_banner';
const DISMISS_INSTALL_BANNER_MS = 7 * 24 * 60 * 60 * 1000;

export function isInstallBannerDismissed(): boolean {
  if (typeof window === 'undefined') return true;
  const raw = window.localStorage.getItem(DISMISS_INSTALL_BANNER_KEY);
  if (!raw) return false;
  const dismissedAt = Number(raw);
  if (Number.isNaN(dismissedAt)) return false;
  return Date.now() - dismissedAt < DISMISS_INSTALL_BANNER_MS;
}

export function dismissInstallBanner() {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DISMISS_INSTALL_BANNER_KEY, String(Date.now()));
}
