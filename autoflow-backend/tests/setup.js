'use strict';
process.env.NODE_ENV    = 'test';
process.env.JWT_SECRET  = 'test-jwt-secret-minimum-64-chars-for-hmac-sha256-abcdefghijklmnop';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret-minimum-64-chars-padding-abcdefghijklmnopqr';
process.env.REDIS_URL   = '';  // disabled — rate limiter fails open
process.env.SMTP_HOST   = '';  // disabled — auth emails log only
