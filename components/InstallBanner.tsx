'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { dismissInstallBanner, isInstallBannerDismissed } from '@/lib/participant';

// iOS's "Share" glyph (square.and.arrow.up): an up arrow over an open-top tray. Rendering it
// inline makes the instruction below unmistakable instead of relying on a generic emoji.
function ShareIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5 shrink-0"
    >
      <path d="M12 2v13" />
      <path d="M8 6l4-4 4 4" />
      <path d="M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8" />
    </svg>
  );
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

type BannerState =
  | { kind: 'hidden' }
  | { kind: 'in-app-browser' }
  | { kind: 'ios-safari' }
  | { kind: 'ios-other-browser' }
  | { kind: 'android-prompt'; promptEvent: BeforeInstallPromptEvent };

// Apps like Instagram/TikTok/Facebook open links in a restricted in-app webview that can't
// install PWAs (no beforeinstallprompt, no Safari share sheet) — users need to be told to
// reopen in the real browser first.
const IN_APP_BROWSER_UA = /Instagram|FBAN|FBAV|TikTok|BytedanceWebview|musical_ly/i;

// Every iOS browser is a Safari/WebKit shell under the hood, but only Safari itself exposes
// the "Add to Home Screen" install path — Chrome, Firefox, Edge, Opera, etc. on iOS can't
// install PWAs at all, even though they render the site fine. Each of them tags its UA with
// its own token, which is how we tell them apart from real Safari.
// Note: Brave for iOS deliberately mirrors Safari's UA (no distinguishing token), so it's
// indistinguishable from Safari here — a known gap, not an oversight.
const NON_SAFARI_IOS_BROWSER_UA = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|YaBrowser|mercury/i;

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
  const [copied, setCopied] = useState(false);

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
    if (isIOS()) {
      return NON_SAFARI_IOS_BROWSER_UA.test(window.navigator.userAgent)
        ? { kind: 'ios-other-browser' }
        : { kind: 'ios-safari' };
    }
    return { kind: 'hidden' };
  }, [mounted, installed, dismissed, promptEvent]);

  async function handleInstallClick() {
    if (state.kind !== 'android-prompt') return;
    await state.promptEvent.prompt();
    await state.promptEvent.userChoice;
    setPromptEvent(null);
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available or blocked; the visible instruction remains as fallback.
    }
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
          className={clsx(
            'fixed bottom-4 left-4 right-4 z-50 mx-auto flex max-w-md gap-2 border border-brand-pink/40 bg-brand-dark text-white shadow-lg shadow-black/40',
            state.kind === 'ios-safari' || state.kind === 'ios-other-browser'
              ? 'items-start rounded-2xl px-4 py-3 text-xs'
              : 'items-center rounded-full px-3 py-2 text-xs'
          )}
        >
          <span className="shrink-0 text-base leading-none">🍿</span>

          {state.kind === 'in-app-browser' && (
            <span className="flex-1 truncate">Para instalar, abrilo en Safari/Chrome ↗️</span>
          )}
          {state.kind === 'ios-safari' && (
            <div className="flex-1 space-y-0.5">
              <p className="font-semibold">Para instalar en tu iPhone:</p>
              <p className="flex items-center gap-1">
                1. Tocá <ShareIcon /> Compartir
              </p>
              <p>2. Elegí &quot;Agregar a inicio&quot;</p>
            </div>
          )}
          {state.kind === 'ios-other-browser' && (
            <div className="flex-1 space-y-1.5">
              <p>Para instalar en tu iPhone, abrí este link en Safari 🧭</p>
              <button
                onClick={handleCopyLink}
                className="rounded-full border border-white/20 px-2.5 py-1 text-[11px] font-semibold text-white"
              >
                {copied ? '¡Copiado!' : 'Copiar link'}
              </button>
            </div>
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
