'use strict';
module.exports = {
  testEnvironment:    'node',
  testMatch:          ['**/tests/**/*.test.js'],
  testTimeout:        20000,
  verbose:            true,
  forceExit:          true,
  detectOpenHandles:  true,
  runInBand:          true,          // serial — our store singleton requires it
  setupFiles:         ['./tests/setup.js'],
  coverageDirectory:  'coverage',
  collectCoverageFrom: [
    'routes/**/*.js',
    'services/**/*.js',
    'middleware/**/*.js',
    '!routes/extra/**',
    '!routes/index.js',
  ],
};
