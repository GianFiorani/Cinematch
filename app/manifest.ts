import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'CineMatch',
    short_name: 'CineMatch',
    description:
      'Creá una sala, invitá a tu pareja o amigos y encontrá con un swipe la película o serie que todos quieren ver.',
    start_url: '/?source=pwa',
    display: 'standalone',
    background_color: '#0F0F14',
    theme_color: '#0F0F14',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
