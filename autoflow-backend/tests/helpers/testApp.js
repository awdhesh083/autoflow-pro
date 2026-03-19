'use strict';
/**
 * Test App — offline, no real DB or Redis.
 * Mongoose models are replaced with in-memory Maps so tests run without MongoDB.
 */
process.env.NODE_ENV             = 'test';
process.env.JWT_SECRET           = 'test-jwt-secret-minimum-64-chars-for-hmac-sha256-abcdefghijklmnop';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret-minimum-64-chars-abcdefghijklmnopqrstuvwxyz12';
process.env.REDIS_URL            = '';

const express      = require('express');
const mongoSanitize= require('express-mongo-sanitize');
const xss          = require('xss-clean');
const mongoose     = require('mongoose');
const errorHandler = require('../../middleware/errorHandler');

// ── In-memory store backing all mongoose model operations ─────────────────
const stores = {};

function getStore(name) {
  if (!stores[name]) stores[name] = new Map();
  return stores[name];
}

function makeId() {
  return new mongoose.Types.ObjectId();
}

// Fake document that behaves like a mongoose doc
function fakeDoc(data, modelName) {
  const id  = data._id || makeId();
  const now = new Date();
  const doc = {
    ...data,
    _id:       id,
    id:        id.toString(),
    createdAt: data.createdAt || now,
    updatedAt: data.updatedAt || now,
    toObject:  () => {
      // Return plain object without mock functions
      const plain = {};
      for (const [k, v] of Object.entries(doc)) {
        if (typeof v !== 'function') plain[k] = v;
      }
      plain._id = doc._id;
      return plain;
    },
    toJSON:    () => {
      const plain = {};
      for (const [k, v] of Object.entries(doc)) {
        if (typeof v !== 'function') plain[k] = v;
      }
      plain._id = doc._id;
      return plain;
    },
    save: async function() {
      const stored = getStore(modelName).get(String(this._id)) || {};
      // Always re-hash if password changed and is plaintext
      if (this.password && !this.password.startsWith('$2')) {
        const bcrypt = require('bcryptjs');
        this.password = await bcrypt.hash(this.password, 10);
      }
      getStore(modelName).set(String(this._id), {
        ...stored,
        ...this,
        updatedAt: new Date(),
      });
      return this;
    },
    isLocked: () => false,
    comparePassword: async function(pw) {
      const bcrypt = require('bcryptjs');
      return bcrypt.compare(pw, this.password);
    },
    isModifiedPassword: false,
  };
  return doc;
}

// Fake model factory
function fakeModel(name) {
  return {
    findOne: (query) => {
      // Return a query-builder that is also thenable (supports both await and .select().lean())
      const promise = findOne(name, query);
      const qb = {
        then:     (res, rej) => promise.then(res, rej),
        catch:    (rej)      => promise.catch(rej),
        select:   function()  { return qb; },
        populate: function()  { return qb; },
        lean:     function()  { return promise.then(doc => doc ? { ...doc } : null); },
      };
      return qb;
    },
    find: (query) => {
      // Return query builder that supports chaining before await
      let skipN = 0, limitN = Infinity;
      const promise = findMany(name, query);
      const qb = {
        then:     (res, rej) => promise.then(docs => {
          let out = docs.slice(skipN, limitN === Infinity ? undefined : skipN + limitN);
          return res(out);
        }, rej),
        catch:    (rej)  => promise.catch(rej),
        skip:     function(n) { skipN = n; return qb; },
        limit:    function(n) { limitN = n; return qb; },
        sort:     function()  { return qb; },
        select:   function()  { return qb; },
        populate: function()  { return qb; },
        lean:     function()  {
          return promise.then(docs => {
            let out = docs.slice(skipN, limitN === Infinity ? undefined : skipN + limitN);
            return out.map(d => ({ ...d }));
          });
        },
      };
      return qb;
    },
    findById: (id) => {
      const idStr = id ? String(id) : null;
      const promise = idStr ? findOne(name, { _id: idStr }) : Promise.resolve(null);
      const qb = {
        then:     (res, rej) => promise.then(res, rej),
        catch:    (rej)      => promise.catch(rej),
        select:   function()  { return qb; },
        populate: function()  { return qb; },
        lean:     function()  { return promise.then(doc => doc ? { ...doc } : null); },
      };
      return qb;
    },
    findByIdAndUpdate: (id, update, opts) => {
      const promise = findByIdAndUpdate(name, id, update, opts || {});
      const qb = {
        then:     (res, rej) => promise.then(res, rej),
        catch:    (rej)      => promise.catch(rej),
        select:   function()  { return qb; },
        populate: function()  { return qb; },
        lean:     function()  { return promise.then(doc => doc ? { ...doc } : null); },
      };
      return qb;
    },
    findOneAndUpdate:   async (q, u, o) => findOneAndUpdate(name, q, u, o),
    findOneAndDelete:   async (q)      => findOneAndDelete(name, q),
    findByIdAndDelete:  async (id)     => findOneAndDelete(name, { _id: id }),
    countDocuments:     async (q)      => countDocuments(name, q),
    create:             async (data)   => createDoc(name, data),
    updateMany:         async ()       => ({ modifiedCount: 0 }),
    deleteMany:         async (q)      => deleteMany(name, q),
    insertMany: async (docs) => {
      const inserted = [];
      for (const d of (Array.isArray(docs) ? docs : [docs])) {
        const created = await createDoc(name, d);
        inserted.push(created);
      }
      return inserted;
    },
    distinct:           async ()       => [],
    aggregate:          async ()       => [],
    _store:             () => getStore(name),
    _clear:             ()  => getStore(name).clear(),
  };
}

// ── Store operations ──────────────────────────────────────────────────────
async function createDoc(name, data) {
  const bcrypt = require('bcryptjs');
  const doc    = { ...data };
  if (!doc._id) doc._id = makeId();
  doc.createdAt = doc.createdAt || new Date();
  doc.updatedAt = new Date();

  // Set model defaults for User
  if (name === 'User') {
    if (doc.isActive === undefined) doc.isActive = true;
    if (!doc.role)   doc.role   = 'user';
    if (!doc.plan)   doc.plan   = 'free';
    if (!doc.apiKey) doc.apiKey = `sk-af-${require('crypto').randomBytes(16).toString('hex')}`;
  }
  // Initialize common array fields
  if (name === 'ShortLink') {
    if (!doc.clickLog)  doc.clickLog  = [];
    if (doc.clicks === undefined) doc.clicks = 0;
    if (doc.isActive === undefined) doc.isActive = true;
  }
  if (name === 'MessageTemplate') {
    if (!doc.variables) doc.variables = [];
    if (doc.usageCount === undefined) doc.usageCount = 0;
  }
  if (name === 'ContactSegment') {
    if (doc.contactCount === undefined) doc.contactCount = 0;
    if (!doc.rules) doc.rules = [];
  }

  // Hash password if User model
  if (doc.password && !doc.password.startsWith('$2')) {
    doc.password = await bcrypt.hash(doc.password, 10);
  }

  const fake = fakeDoc(doc, name);
  getStore(name).set(String(doc._id), { ...doc });
  return fake;
}

function matchesQuery(doc, query) {
  for (const [k, v] of Object.entries(query || {})) {
    if (k === '$or')  { if (!v.some(sub => matchesQuery(doc, sub))) return false; continue; }
    if (k === '$and') { if (!v.every(sub => matchesQuery(doc, sub))) return false; continue; }
    const docVal = k.includes('.') ? k.split('.').reduce((o, p) => o?.[p], doc) : doc[k];
    if (v && typeof v === 'object' && !mongoose.Types.ObjectId.isValid(v) && !(v instanceof mongoose.Types.ObjectId)) {
      if (v.$ne !== undefined && docVal == v.$ne) return false;
      if (v.$gt  !== undefined && !(docVal >  v.$gt))  return false;
      if (v.$gte !== undefined && !(docVal >= v.$gte)) return false;
      if (v.$in  !== undefined && !v.$in.some(x => String(x) === String(docVal))) return false;
      if (v.$nin !== undefined && v.$nin.some(x => String(x) === String(docVal))) return false;
      if (v.$regex !== undefined) { if (!new RegExp(v.$regex, v.$options||'').test(docVal||'')) return false; }
    } else {
      if (docVal === undefined && v !== undefined) return false;
      // Handle ObjectId comparison (both as string)
      // Handle boolean comparisons directly
      if (typeof v === 'boolean') {
        if (Boolean(docVal) !== v) return false;
      } else {
        const dv = docVal?._id ? String(docVal._id) : String(docVal ?? '');
        const qv = v?._id      ? String(v._id)      : String(v ?? '');
        if (dv !== qv && docVal !== v) return false;
      }
    }
  }
  return true;
}

async function findOne(name, query) {
  for (const doc of getStore(name).values()) {
    if (matchesQuery(doc, query)) {
      const fake = fakeDoc(doc, name);
      const chain = {
        ...fake,
        select:   function() { return Promise.resolve(this); },
        populate: function() { return Promise.resolve(this); },
        lean:     function() { return Promise.resolve({ ...fake }); },
        then:     undefined,  // prevent auto-await of chainable result
      };
      // Make the chain thenable so await works
      chain.then = (resolve) => resolve(fake);
      return chain;
    }
  }
  // Return null-like that supports .select() without erroring
  const nil = null;
  return nil;
}

async function findMany(name, query) {
  const results = [];
  for (const doc of getStore(name).values()) {
    if (matchesQuery(doc, query)) results.push(fakeDoc(doc, name));
  }
  // Chainable: .skip().limit().sort()
  return Object.assign(results, {
    skip:  function(n) { return Object.assign(results.slice(n), this); },
    limit: function(n) { return Object.assign(results.slice(0, n), this); },
    sort:  function()  { return this; },
    select:function()  { return this; },
    lean:  function()  { return Promise.resolve(results.map(r => ({ ...r }))); },
    populate: function() { return this; },
  });
}

async function findByIdAndUpdate(name, id, update, opts = {}) {
  const store = getStore(name);
  const key   = String(id);
  const doc   = store.get(key);
  if (!doc) return null;

  // Apply $set, $inc, $push, $pull operators
  const updated = { ...doc };
  if (update.$set)  Object.assign(updated, update.$set);
  if (update.$inc) {
    for (const [k, v] of Object.entries(update.$inc)) {
      const parts = k.split('.');
      let obj = updated;
      for (let i = 0; i < parts.length - 1; i++) { obj[parts[i]] = obj[parts[i]] || {}; obj = obj[parts[i]]; }
      obj[parts[parts.length-1]] = (obj[parts[parts.length-1]] || 0) + v;
    }
  }
  if (!update.$set && !update.$inc && !update.$push && !update.$pull && !update.$addToSet) {
    Object.assign(updated, update);
  }
  updated.updatedAt = new Date();
  store.set(key, updated);
  return opts.new ? fakeDoc(updated, name) : fakeDoc(doc, name);
}

async function findOneAndUpdate(name, query, update, opts = {}) {
  const found = await findOne(name, query);
  if (!found) return null;
  return findByIdAndUpdate(name, found._id, update, opts);
}

async function findOneAndDelete(name, query) {
  const found = await findOne(name, query);
  if (!found) return null;
  getStore(name).delete(String(found._id));
  return found;
}

async function deleteMany(name, query) {
  const store = getStore(name);
  let count = 0;
  for (const [k, doc] of store.entries()) {
    if (!query || matchesQuery(doc, query)) { store.delete(k); count++; }
  }
  return { deletedCount: count };
}

async function countDocuments(name, query) {
  let count = 0;
  for (const doc of getStore(name).values()) {
    if (matchesQuery(doc, query)) count++;
  }
  return count;
}

// ── Patch mongoose.model to return fake models ────────────────────────────
const originalModel = mongoose.model.bind(mongoose);
const modelCache    = {};

mongoose.model = function(name, schema) {
  if (!modelCache[name]) {
    modelCache[name] = fakeModel(name);
    // Keep original model registered for schema access
    try { originalModel(name, schema || new mongoose.Schema({})); } catch {}
  }
  return modelCache[name];
};

// Pre-register all models used in routes
require('../../models');

// Patch stores for clearAll
function clearAllStores() {
  Object.values(stores).forEach(s => s.clear());
}

// ── Build Express app ─────────────────────────────────────────────────────
function buildApp() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(mongoSanitize());
  app.use(xss());

  app.use('/api/v1/auth',      require('../../routes/auth'));
  app.use('/api/v1/contacts',  require('../../routes/contacts'));
  app.use('/api/v1/campaigns', require('../../routes/campaigns'));
  app.use('/api/v1/templates', require('../../routes/templates'));
  app.use('/api/v1/segments',  require('../../routes/segments'));
  app.use('/api/v1/links',     require('../../routes/links'));
  app.use('/api/v1/analytics', require('../../routes/analytics'));
  app.use('/api/v1/privacy',   require('../../routes/gdpr'));
  app.use('/api/v1/audit',     require('../../routes/audit'));
  app.use('/api/v1/settings',  require('../../routes/settings'));
  app.use('/api/v1/sequences', require('../../routes/sequences'));
  app.use('/api/v1/tracking',  require('../../routes/tracking'));
  app.use('/api/v1/search',    require('../../routes/search'));

  app.use(errorHandler);
  return app;
}

module.exports = { buildApp, clearAllStores };
