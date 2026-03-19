'use strict';
/**
 * Test DB helper — offline mode using jest mocks.
 * All Mongoose models are mocked globally in jest.setup.js.
 * These stubs allow test files to call connect/disconnect without real DB.
 */
async function connect() {}
async function disconnect() {}
async function clearAll() {}
module.exports = { connect, disconnect, clearAll };
