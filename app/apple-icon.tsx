import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
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
            gap: '6px',
          }}
        >
          <div style={{ color: 'white', fontSize: 76, fontWeight: 900, lineHeight: '1' }}>WR</div>
          <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 18, fontWeight: 600, letterSpacing: '2px' }}>
            WatchRoom
          </div>
        </div>
      </div>
    ),
    size,
  );
}
