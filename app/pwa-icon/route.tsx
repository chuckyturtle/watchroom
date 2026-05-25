import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

export async function GET(req: NextRequest) {
  const size = Math.min(512, Math.max(16, parseInt(req.nextUrl.searchParams.get('size') || '192')));

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: String(Math.floor(size * 0.04)) + 'px',
          }}
        >
          {/* Film clapper icon approximation */}
          <div
            style={{
              display: 'flex',
              color: 'white',
              fontSize: String(Math.floor(size * 0.42)) + 'px',
              fontWeight: 900,
              letterSpacing: String(-Math.floor(size * 0.02)) + 'px',
              lineHeight: '1',
            }}
          >
            WR
          </div>
          <div
            style={{
              display: 'flex',
              color: 'rgba(255,255,255,0.55)',
              fontSize: String(Math.floor(size * 0.1)) + 'px',
              fontWeight: 600,
              letterSpacing: String(Math.floor(size * 0.015)) + 'px',
              textTransform: 'uppercase',
            }}
          >
            WatchRoom
          </div>
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}
