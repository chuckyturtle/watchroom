import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'WatchRoom',
    short_name: 'WatchRoom',
    description: 'Ve YouTube, Twitch y Kick con amigos',
    start_url: '/',
    display: 'standalone',
    background_color: '#0f0f13',
    theme_color: '#4f46e5',
    orientation: 'portrait',
    categories: ['entertainment', 'music'],
    icons: [
      {
        src: '/pwa-icon?size=192',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/pwa-icon?size=512',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/pwa-icon?size=512',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
