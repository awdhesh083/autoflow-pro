const crypto = require('crypto');

const delay         = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const randomDelay   = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const generateToken = (len = 32) => crypto.randomBytes(len).toString('hex');
const sanitizePhone = (phone) => {
  const cleaned = phone.replace(/[^0-9+]/g, '');
  return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
};
const chunk = (arr, size) => {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
};
const personalizeText = (template, vars = {}) => {
  if (!template) return '';
  let result = template;
  for (const [k, v] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\[${k}\\]`, 'gi'), v || '');
  }
  return result.replace(/\[[a-z_]+\]/gi, '');
};
const trackingPixel = (id) =>
  `<img src="${process.env.BASE_URL||'http://localhost:5000'}/api/v1/email/track/open/${id}" width="1" height="1" style="display:none" alt="">`;
const wrapLinks = (html, id) => {
  let idx = 0;
  return html.replace(/href="(https?:\/\/[^"]+)"/gi, (m, url) => {
    const trackUrl = `${process.env.BASE_URL||'http://localhost:5000'}/api/v1/email/track/click/${id}/${idx++}`;
    return `href="${trackUrl}" data-original="${url}"`;
  });
};
const paginate = async (Model, query, opts = {}) => {
  const { page = 1, limit = 20, sort = '-createdAt' } = opts;
  const skip  = (page - 1) * limit;
  const total = await Model.countDocuments(query);
  const data  = await Model.find(query).skip(skip).limit(+limit).sort(sort);
  return { data, total, page: +page, pages: Math.ceil(total / limit) };
};

module.exports = { delay, randomDelay, generateToken, sanitizePhone, chunk, personalizeText, trackingPixel, wrapLinks, paginate };
