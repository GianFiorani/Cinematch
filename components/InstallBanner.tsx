'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { dismissInstallBanner, isInstallBannerDismissed } from '@/lib/participant';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

type BannerState =
  | { kind: 'hidden' }
  | { kind: 'in-app-browser' }
  | { kind: 'ios' }
  | { kind: 'android-prompt'; promptEvent: BeforeInstallPromptEvent };

// Apps like Instagram/TikTok/Facebook open links in a restricted in-app webview that can't
// install PWAs (no beforeinstallprompt, no Safari share sheet) — users need to be told to
// reopen in the real browser first.
const IN_APP_BROWSER_UA = /Instagram|FBAN|FBAV|TikTok|BytedanceWebview|musical_ly/i;

function isStandalone(): boolean {
  const displayModeStandalone = window.matchMedia('(display-mode: standalone)').matches;
  // iOS Safari's legacy (non-standard) flag for "launched from home screen".
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return displayModeStandalone || iosStandalone;
}

function isIOS(): boolean {
  const ua = window.navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ reports as "Macintosh" in desktop mode; touch support is the tell.
  return window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1;
}

export function InstallBanner() {
  const [mounted, setMounted] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    setMounted(true);
    setDismissed(isInstallBannerDismissed());

    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    }
    function handleAppInstalled() {
      setInstalled(true);
      setPromptEvent(null);
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const state: BannerState = useMemo(() => {
    if (!mounted || installed || dismissed || isStandalone()) return { kind: 'hidden' };
    if (IN_APP_BROWSER_UA.test(window.navigator.userAgent)) return { kind: 'in-app-browser' };
    if (promptEvent) return { kind: 'android-prompt', promptEvent };
    if (isIOS()) return { kind: 'ios' };
    return { kind: 'hidden' };
  }, [mounted, installed, dismissed, promptEvent]);

  async function handleInstallClick() {
    if (state.kind !== 'android-prompt') return;
    await state.promptEvent.prompt();
    await state.promptEvent.userChoice;
    setPromptEvent(null);
  }

  function handleDismiss() {
    dismissInstallBanner();
    setDismissed(true);
  }

  return (
    <AnimatePresence>
      {state.kind !== 'hidden' && (
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 26 }}
          className="fixed bottom-4 left-4 right-4 z-50 mx-auto flex max-w-md items-center gap-2 rounded-full border border-brand-pink/40 bg-brand-dark px-3 py-2 text-xs text-white shadow-lg shadow-black/40"
        >
          <span className="shrink-0 text-base leading-none">🍿</span>

          {state.kind === 'in-app-browser' && (
            <span className="flex-1 truncate">Para instalar, abrilo en Safari/Chrome ↗️</span>
          )}
          {state.kind === 'ios' && (
            <span className="flex-1 truncate">Para instalar: tocá ⬆️ y &quot;Agregar a inicio&quot;</span>
          )}
          {state.kind === 'android-prompt' && (
            <>
              <span className="flex-1 truncate">Instalá CineMatch en tu celular</span>
              <button
                onClick={handleInstallClick}
                className="shrink-0 rounded-full bg-gradient-to-r from-brand-pink to-brand-orange px-3 py-1 font-semibold text-white"
              >
                Instalar App
              </button>
            </>
          )}

          <button
            onClick={handleDismiss}
            aria-label="Cerrar aviso de instalación"
            className="ml-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white/50 hover:text-white/80"
          >
            ✕
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
