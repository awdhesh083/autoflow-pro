'use strict';
const request = require('supertest');
const { buildApp, clearAllStores } = require('../helpers/testApp');
const { registerAndLogin }         = require('../helpers/fixtures');

let app;
const BASE = '/api/v1/campaigns';

beforeAll(() => { app = buildApp(); });
afterAll(() => clearAllStores());

async function freshUser() {
  clearAllStores();
  const { token } = await registerAndLogin(app, { email: `u_${Date.now()}@test.com` });
  return token;
}

const PAYLOAD = { name: 'Test Campaign', type: 'email', content: { body: 'Hello [name]!', subject: 'Test Subject' } };

// ─────────────────────────────────────────────────────────
describe('POST /campaigns', () => {
  it('creates a draft campaign', async () => {
    const token = await freshUser();
    const res = await request(app).post(BASE).set('Authorization', `Bearer ${token}`).send(PAYLOAD);
    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('Test Campaign');
    expect(res.body.data.status).toBe('draft');
  });

  it('rejects campaign without name', async () => {
    const token = await freshUser();
    const res = await request(app).post(BASE).set('Authorization', `Bearer ${token}`)
      .send({ type: 'email', content: { body: 'Hello' } });
    expect(res.status).toBe(400);
  });

  it('rejects invalid campaign type', async () => {
    const token = await freshUser();
    const res = await request(app).post(BASE).set('Authorization', `Bearer ${token}`)
      .send({ name: 'Bad', type: 'fax', content: { body: 'Hello' } });
    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────
describe('GET /campaigns', () => {
  it('returns user campaigns', async () => {
    const token = await freshUser();
    await request(app).post(BASE).set('Authorization', `Bearer ${token}`).send(PAYLOAD);
    await request(app).post(BASE).set('Authorization', `Bearer ${token}`)
      .send({ ...PAYLOAD, name: 'WA Blast', type: 'whatsapp' });

    const res = await request(app).get(BASE).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
  });

  it('filters by type', async () => {
    const token = await freshUser();
    await request(app).post(BASE).set('Authorization', `Bearer ${token}`).send(PAYLOAD);
    await request(app).post(BASE).set('Authorization', `Bearer ${token}`)
      .send({ ...PAYLOAD, name: 'SMS', type: 'sms' });

    const res = await request(app).get(`${BASE}?type=sms`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.every(c => c.type === 'sms')).toBe(true);
  });

  it('does not leak other users campaigns', async () => {
    const token1 = await freshUser();
    await request(app).post(BASE).set('Authorization', `Bearer ${token1}`).send(PAYLOAD);

    const { token: token2 } = await registerAndLogin(app, { email: `x_${Date.now()}@test.com` });
    const res = await request(app).get(BASE).set('Authorization', `Bearer ${token2}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────
describe('GET /campaigns/:id', () => {
  it('returns single campaign', async () => {
    const token = await freshUser();
    const create = await request(app).post(BASE).set('Authorization', `Bearer ${token}`).send(PAYLOAD);
    const id = create.body.data._id;
    const res = await request(app).get(`${BASE}/${id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data._id).toBe(id);
  });

  it('returns 404 for missing campaign', async () => {
    const token = await freshUser();
    const res = await request(app).get(`${BASE}/507f1f77bcf86cd799439011`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────
describe('POST /campaigns/:id/duplicate', () => {
  it('duplicates as draft with (copy) suffix', async () => {
    const token = await freshUser();
    const create = await request(app).post(BASE).set('Authorization', `Bearer ${token}`).send(PAYLOAD);
    const res = await request(app).post(`${BASE}/${create.body.data._id}/duplicate`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('draft');
    expect(res.body.data.name).toMatch(/copy/i);
  });
});

// ─────────────────────────────────────────────────────────
describe('DELETE /campaigns/:id', () => {
  it('deletes campaign and confirms 404', async () => {
    const token = await freshUser();
    const create = await request(app).post(BASE).set('Authorization', `Bearer ${token}`).send(PAYLOAD);
    const id = create.body.data._id;
    await request(app).delete(`${BASE}/${id}`).set('Authorization', `Bearer ${token}`);
    const get = await request(app).get(`${BASE}/${id}`).set('Authorization', `Bearer ${token}`);
    expect(get.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────
describe('POST /campaigns/:id/ab/*', () => {
  it('returns 400 when A/B not enabled', async () => {
    const token = await freshUser();
    const create = await request(app).post(BASE).set('Authorization', `Bearer ${token}`).send(PAYLOAD);
    const res = await request(app).get(`${BASE}/${create.body.data._id}/ab/stats`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });
});
