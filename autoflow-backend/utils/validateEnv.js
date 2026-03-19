'use strict';
/**
 * Startup Validator
 * Called at the very top of server.js before any route or service loads.
 * Crashes early with a clear human-readable message if config is wrong.
 */

const REQUIRED = [
  { key: 'MONGODB_URI',  hint: 'MongoDB Atlas free tier → https://mongodb.com/atlas' },
  { key: 'JWT_SECRET',   hint: 'Generate: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"' },
];

const RECOMMENDED = [
  { key: 'ANTHROPIC_API_KEY', hint: 'AI features — get at https://console.anthropic.com' },
  { key: 'REDIS_URL',         hint: 'Caching/queues — Upstash free tier → https://upstash.com' },
];

function validateEnv() {
  const missing = REQUIRED.filter(r => !process.env[r.key]);

  if (missing.length) {
    console.error('\n╔══════════════════════════════════════════════════════════╗');
    console.error('║  ❌  AutoFlow — Missing required environment variables   ║');
    console.error('╚══════════════════════════════════════════════════════════╝\n');
    missing.forEach(({ key, hint }) => {
      console.error(`  ✗  ${key}`);
      console.error(`     ${hint}\n`);
    });
    console.error('  → Copy .env.example → .env  and fill in the values.\n');
    process.exit(1);
  }

  const absent = RECOMMENDED.filter(r => !process.env[r.key]);
  if (absent.length) {
    console.warn('\n⚠️   Recommended env vars not set (some features will be disabled):');
    absent.forEach(({ key, hint }) => console.warn(`  •  ${key}  —  ${hint}`));
    console.warn('');
  }
}

module.exports = { validateEnv };
