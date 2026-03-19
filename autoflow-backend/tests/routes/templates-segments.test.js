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

const TMPL = '/api/v1/templates';
const SEG  = '/api/v1/segments';

// ─────────────────────────────────────────────────────────
describe('Message Templates', () => {
  it('creates template and detects [variable] placeholders', async () => {
    const token = await freshUser();
    const res = await request(app).post(TMPL).set('Authorization', `Bearer ${token}`)
      .send({ name: 'WA Welcome', platform: 'whatsapp', body: 'Hi [name]! Visit [link] today.' });
    expect(res.status).toBe(201);
    expect(res.body.data.variables).toContain('name');
    expect(res.body.data.variables).toContain('link');
  });

  it('lists templates filtered by platform', async () => {
    const token = await freshUser();
    await request(app).post(TMPL).set('Authorization', `Bearer ${token}`)
      .send({ name: 'A', platform: 'instagram', body: 'Hi [name]' });
    await request(app).post(TMPL).set('Authorization', `Bearer ${token}`)
      .send({ name: 'B', platform: 'whatsapp',  body: 'Hi [name]' });

    const res = await request(app).get(`${TMPL}?platform=whatsapp`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.every(t => ['whatsapp','all'].includes(t.platform))).toBe(true);
  });

  it('personalizes variables on /apply', async () => {
    const token = await freshUser();
    const create = await request(app).post(TMPL).set('Authorization', `Bearer ${token}`)
      .send({ name: 'Promo', platform: 'email', body: 'Hi [name], use code [code] for 20% off!' });
    const res = await request(app).post(`${TMPL}/${create.body.data._id}/apply`)
      .set('Authorization', `Bearer ${token}`)
      .send({ variables: { name: 'Priya', code: 'SAVE20' } });
    expect(res.status).toBe(200);
    expect(res.body.data.body).toContain('Priya');
    expect(res.body.data.body).not.toContain('[name]');
  });

  it('duplicates template with (copy) suffix', async () => {
    const token = await freshUser();
    const create = await request(app).post(TMPL).set('Authorization', `Bearer ${token}`)
      .send({ name: 'Original', platform: 'sms', body: 'Message' });
    const dup = await request(app).post(`${TMPL}/${create.body.data._id}/duplicate`)
      .set('Authorization', `Bearer ${token}`);
    expect(dup.status).toBe(201);
    expect(dup.body.data.name).toMatch(/copy/i);
  });

  it('deletes a template', async () => {
    const token = await freshUser();
    const create = await request(app).post(TMPL).set('Authorization', `Bearer ${token}`)
      .send({ name: 'Bye', platform: 'email', body: 'Bye' });
    const del = await request(app).delete(`${TMPL}/${create.body.data._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────
describe('Contact Segments', () => {
  it('creates segment with rules', async () => {
    const token = await freshUser();
    const res = await request(app).post(SEG).set('Authorization', `Bearer ${token}`)
      .send({ name: 'High Score', rules: [{ field: 'score', operator: 'gte', value: 80 }], logic: 'AND' });
    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('High Score');
  });

  it('previews matching contacts', async () => {
    const token = await freshUser();
    const res = await request(app).post(`${SEG}/preview`).set('Authorization', `Bearer ${token}`)
      .send({ rules: [{ field: 'tags', operator: 'contains', value: 'VIP' }] });
    expect(res.status).toBe(200);
    expect(typeof res.body.total).toBe('number');
  });

  it('returns built-in segment templates', async () => {
    const token = await freshUser();
    const res = await request(app).get(`${SEG}/meta/templates`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('lists user segments', async () => {
    const token = await freshUser();
    await request(app).post(SEG).set('Authorization', `Bearer ${token}`)
      .send({ name: 'Seg A', rules: [{ field: 'score', operator: 'gte', value: 50 }] });
    const res = await request(app).get(SEG).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('deletes a segment', async () => {
    const token = await freshUser();
    const create = await request(app).post(SEG).set('Authorization', `Bearer ${token}`)
      .send({ name: 'Del Me', rules: [{ field: 'score', operator: 'gt', value: 0 }] });
    const del = await request(app).delete(`${SEG}/${create.body.data._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(200);
  });
});
