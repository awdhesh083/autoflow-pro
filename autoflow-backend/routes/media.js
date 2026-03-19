'use strict';
const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = 'uploads/media';
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive:true });
      cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g,'_')}`),
  }),
  limits: { fileSize: 100*1024*1024 }, // 100MB
});

// POST /upload - upload any file
router.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success:false, message:'No file uploaded' });
  const baseUrl = process.env.BASE_URL||'http://localhost:5000';
  const url     = `${baseUrl}/uploads/media/${req.file.filename}`;
  res.json({ success:true, url, filename:req.file.filename, mimetype:req.file.mimetype, size:req.file.size });
});

// POST /upload-multiple
router.post('/upload-multiple', upload.array('files', 10), async (req, res) => {
  if (!req.files?.length) return res.status(400).json({ success:false, message:'No files uploaded' });
  const baseUrl = process.env.BASE_URL||'http://localhost:5000';
  const files   = req.files.map(f => ({ url:`${baseUrl}/uploads/media/${f.filename}`, filename:f.filename, mimetype:f.mimetype, size:f.size }));
  res.json({ success:true, files });
});

// GET /list - list uploaded files
router.get('/list', async (req, res) => {
  const dir     = 'uploads/media';
  const baseUrl = process.env.BASE_URL||'http://localhost:5000';
  if (!fs.existsSync(dir)) return res.json({ success:true, data:[] });
  const files = fs.readdirSync(dir).map(f => ({
    filename:  f,
    url:       `${baseUrl}/uploads/media/${f}`,
    size:      fs.statSync(`${dir}/${f}`).size,
    createdAt: fs.statSync(`${dir}/${f}`).mtime,
  })).sort((a,b) => b.createdAt-a.createdAt);
  res.json({ success:true, data:files, total:files.length });
});

// DELETE /:filename
router.delete('/:filename', async (req, res) => {
  const filepath = `uploads/media/${req.params.filename}`;
  if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
  res.json({ success:true, message:'File deleted' });
});

module.exports = router;
