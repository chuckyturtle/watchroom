#!/usr/bin/env node
// Runs `prisma db push` after stripping parameters that Prisma's CLI
// does not support (e.g. channel_binding=require added by Neon).
const { execSync } = require('child_process');

if (process.env.DATABASE_URL) {
  const cleaned = process.env.DATABASE_URL
    .replace(/[?&]channel_binding=[^&]*/g, '')
    .replace(/\?$/, ''); // remove trailing '?' if channel_binding was the only param
  process.env.DATABASE_URL = cleaned;
  console.log('DATABASE_URL sanitized for prisma db push');
}

try {
  execSync('npx prisma db push --accept-data-loss', { stdio: 'inherit' });
  console.log('prisma db push completed successfully');
} catch (err) {
  console.error('prisma db push failed:', err.message);
  process.exit(1);
}
