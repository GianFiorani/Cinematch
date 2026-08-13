import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CineMatch — Decidí qué ver, sin pelear',
  description:
    'Creá una sala, invitá a tu pareja o amigos y encontrá con un swipe la película o serie que todos quieren ver.',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'CineMatch',
  },
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0F0F14',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="bg-brand-dark text-white antialiased">
        <div className="mx-auto flex min-h-dvh max-w-md flex-col">{children}</div>
      </body>
    </html>
  );
}
