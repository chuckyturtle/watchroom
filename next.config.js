const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [{
      source: '/(.*)',
      headers: [{
        // Deny media-session access to cross-origin iframes (e.g. YouTube embed)
        // so their seekforward/seekbackward handlers don't override ours.
        // The top-level page (self) keeps full access.
        key: 'Permissions-Policy',
        value: 'media-session=(self)',
      }],
    }];
  },
  webpack(config) {
    // Explicitly tell webpack what "@/" resolves to — needed on some CI/cloud environments
    // where tsconfig path aliases are not automatically picked up
    config.resolve.alias['@'] = path.resolve(__dirname);
    return config;
  },
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
