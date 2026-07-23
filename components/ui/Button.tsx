'use client';

import { ButtonHTMLAttributes, forwardRef } from 'react';
import clsx from 'clsx';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={clsx(
          'flex items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-60',
          variant === 'primary' &&
            'bg-gradient-to-r from-brand-pink to-brand-orange text-white shadow-lg shadow-brand-pink/20',
          variant === 'secondary' && 'border border-white/15 bg-brand-surface text-white',
          variant === 'ghost' && 'text-white/70 hover:text-white',
          className
        )}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';
