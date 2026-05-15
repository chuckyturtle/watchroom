/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'i.ytimg.com' },
      { protocol: 'https', hostname: 'static-cdn.jtvnw.net' },
      { protocol: 'https', hostname: '*.kick.com' },
      { protocol: 'https', hostname: 'img.youtube.com' },
    ],
  },
};

module.exports = nextConfig;
