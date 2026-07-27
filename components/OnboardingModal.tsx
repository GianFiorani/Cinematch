'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Button } from './ui/Button';

interface OnboardingModalProps {
  open: boolean;
  onClose: () => void;
}

const STEPS = [
  { emoji: '🎬', text: 'Elegí qué quieren ver y armá la sala.' },
  { emoji: '📲', text: 'Mandale el link a tu compañero por WhatsApp.' },
  { emoji: '❤️', text: 'Deslizá a la derecha las que te interesen. ¡Si coinciden, hay MATCH!' },
];

export function OnboardingModal({ open, onClose }: OnboardingModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 px-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="w-full max-w-sm rounded-3xl bg-brand-surface p-6"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="onboarding-title"
          >
            <h2 id="onboarding-title" className="mb-6 text-center text-2xl font-extrabold text-white">
              ¿Cómo funciona?
            </h2>

            <ol className="flex flex-col gap-5">
              {STEPS.map((step, i) => (
                <li key={i} className="flex items-start gap-4">
                  <span
                    className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-brand-pink to-brand-orange text-xl font-bold text-white"
                    aria-hidden="true"
                  >
                    {i + 1}
                  </span>
                  <p className="pt-2 text-lg leading-snug text-white">
                    <span className="mr-1" aria-hidden="true">
                      {step.emoji}
                    </span>{' '}
                    {step.text}
                  </p>
                </li>
              ))}
            </ol>

            <Button onClick={onClose} className="mt-7 w-full text-lg">
              ¡Entendido!
            </Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
