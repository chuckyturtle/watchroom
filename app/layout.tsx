import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';

export const metadata: Metadata = {
  title: 'WatchRoom — Ve YouTube, Twitch y Kick con amigos',
  description: 'Disfruta de YouTube, Twitch y Kick sin anuncios. Crea salas inmersivas para ver en grupo con tus amigos.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
