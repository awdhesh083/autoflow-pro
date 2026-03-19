'use strict';
const request = require('supertest');

async function registerAndLogin(app, overrides = {}) {
  const userData = {
    name:     overrides.name     || 'Test User',
    email:    overrides.email    || `test_${Date.now()}@autoflow.io`,
    password: overrides.password || 'Password123!',
  };
  const res = await request(app).post('/api/v1/auth/register').send(userData);
  if (res.status !== 201) throw new Error(`Register failed (${res.status}): ${JSON.stringify(res.body)}`);
  return { token: res.body.token, user: res.body.user, userData };
}

async function createContact(app, token, overrides = {}) {
  const res = await request(app)
    .post('/api/v1/contacts')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name:  overrides.name  || 'Test Contact',
      phone: overrides.phone || '+919876543210',
      email: overrides.email || `contact_${Date.now()}@test.com`,
      tags:  overrides.tags  || ['Lead'],
      ...overrides,
    });
  return res.body.data;
}

async function createCampaign(app, token, overrides = {}) {
  const res = await request(app)
    .post('/api/v1/campaigns')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name:    overrides.name    || 'Test Campaign',
      type:    overrides.type    || 'email',
      content: overrides.content || { body: 'Test message', subject: 'Test subject' },
      ...overrides,
    });
  return res.body.data;
}

module.exports = { registerAndLogin, createContact, createCampaign };
