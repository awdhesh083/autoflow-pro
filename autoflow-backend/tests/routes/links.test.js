'use strict';
const request = require('supertest');
const { buildApp, clearAllStores } = require('../helpers/testApp');
const { registerAndLogin }         = require('../helpers/fixtures');

let app;
beforeAll(() => { app = buildApp(); });
afterAll(() => clearAllStores());

async function freshUser() {
  clearAllStores();
  const { token } = await registerAndLogin(app, { email: `u_${Date.now()}@test.com` });
  return token;
}

const BASE = '/api/v1/links';

// ─────────────────────────────────────────────────────────
describe('POST /links', () => {
  it('shortens a URL and returns shortUrl + shortCode', async () => {
    const token = await freshUser();
    const res = await request(app).post(BASE)
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'https://example.com/very-long-url', platform: 'whatsapp', campaignName: 'Test Camp' });
    expect(res.status).toBe(201);
    expect(res.body.data.shortUrl).toBeTruthy();
    expect(res.body.data.shortCode).toBeTruthy();
    expect(res.body.data.shortCode.length).toBe(6);
  });

  it('generates unique codes for the same URL', async () => {
    const token = await freshUser();
    const r1 = await request(app).post(BASE).set('Authorization', `Bearer ${token}`)
      .send({ url: 'https://example.com' });
    const r2 = await request(app).post(BASE).set('Authorization', `Bearer ${token}`)
      .send({ url: 'https://example.com' });
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(r1.body.data.shortCode).not.toBe(r2.body.data.shortCode);
  });

  it('requires url field', async () => {
    const token = await freshUser();
    const res = await request(app).post(BASE)
      .set('Authorization', `Bearer ${token}`)
      .send({ platform: 'email' });
    expect(res.status).toBe(400);
  });

  it('appends UTM params to shortUrl', async () => {
    const token = await freshUser();
    const res = await request(app).post(BASE)
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'https://shop.example.com', platform: 'email', campaignName: 'Black Friday' });
    expect(res.status).toBe(201);
    expect(res.body.data.utm.source).toBe('autoflow');
    expect(res.body.data.utm.medium).toBe('email');
  });
});

// ─────────────────────────────────────────────────────────
describe('POST /links/bulk', () => {
  it('shortens multiple URLs in one call', async () => {
    const token = await freshUser();
    const res = await request(app).post(`${BASE}/bulk`)
      .set('Authorization', `Bearer ${token}`)
      .send({ urls: ['https://a.com', 'https://b.com', 'https://c.com'], platform: 'whatsapp' });
    expect(res.status).toBe(201);
    expect(res.body.data.length).toBe(3);
    expect(res.body.data[0]).toHaveProperty('shortUrl');
  });

  it('requires urls array', async () => {
    const token = await freshUser();
    const res = await request(app).post(`${BASE}/bulk`)
      .set('Authorization', `Bearer ${token}`)
      .send({ platform: 'email' });
    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────
describe('GET /links/r/:code (public redirect)', () => {
  it('redirects to original URL with UTM params (302)', async () => {
    const token = await freshUser();
    const create = await request(app).post(BASE)
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'https://example.com/product', platform: 'instagram' });
    const code = create.body.data.shortCode;

    const res = await request(app)
      .get(`${BASE}/r/${code}`)
      .redirects(0); // don't follow redirect
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('example.com');
    expect(res.headers.location).toContain('utm_source=autoflow');
  });

  it('redirects to frontend for unknown code', async () => {
    const res = await request(app).get(`${BASE}/r/XXXXXX`).redirects(0);
    expect(res.status).toBe(302);
  });
});

// ─────────────────────────────────────────────────────────
describe('GET /links', () => {
  it('lists all user links', async () => {
    const token = await freshUser();
    await request(app).post(BASE).set('Authorization', `Bearer ${token}`)
      .send({ url: 'https://a.com' });
    await request(app).post(BASE).set('Authorization', `Bearer ${token}`)
      .send({ url: 'https://b.com' });

    const res = await request(app).get(BASE).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
  });
});

// ─────────────────────────────────────────────────────────
describe('GET /links/:id/stats', () => {
  it('returns click analytics structure', async () => {
    const token = await freshUser();
    const create = await request(app).post(BASE).set('Authorization', `Bearer ${token}`)
      .send({ url: 'https://stats.example.com', platform: 'telegram' });
    const id = create.body.data._id || create.body.data.id;

    const res = await request(app).get(`${BASE}/${id}/stats`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('totalClicks');
    expect(res.body.data).toHaveProperty('byDevice');
    expect(res.body.data).toHaveProperty('dailyClicks');
  });
});

// ─────────────────────────────────────────────────────────
describe('POST /links/utm/build', () => {
  it('builds UTM URL without shortening', async () => {
    const token = await freshUser();
    const res = await request(app).post(`${BASE}/utm/build`)
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'https://example.com', medium: 'whatsapp', campaign: 'diwali-sale' });
    expect(res.status).toBe(200);
    expect(res.body.data.url).toContain('utm_source=autoflow');
    expect(res.body.data.url).toContain('utm_medium=whatsapp');
    expect(res.body.data.url).toContain('utm_campaign=diwali-sale');
  });

  it('requires url field', async () => {
    const token = await freshUser();
    const res = await request(app).post(`${BASE}/utm/build`)
      .set('Authorization', `Bearer ${token}`)
      .send({ medium: 'email' });
    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────
describe('DELETE /links/:id', () => {
  it('deletes a link', async () => {
    const token = await freshUser();
    const create = await request(app).post(BASE).set('Authorization', `Bearer ${token}`)
      .send({ url: 'https://delete.example.com' });
    const id = create.body.data._id || create.body.data.id;

    const res = await request(app).delete(`${BASE}/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});
