const express = require('express');
const rateLimit = require('express-rate-limit');
const { db } = require('./db');
const { haversine } = require('./util');
const { geocode } = require('./geocode');
const { groupByPlace } = require('./places');

const r = express.Router();

r.get('/categories', (req, res) => {
  res.json(db.prepare('SELECT id, name, color, icon FROM categories ORDER BY name').all());
});

// Sessions de vente regroupées par lieu.
// count = nombre de marchands DISTINCTS (plusieurs sessions du même marchand = 1).
r.get('/sessions', (req, res) => {
  const day = parseInt(req.query.day, 10);
  const catIds = String(req.query.categories || '')
    .split(',')
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  const radius = parseFloat(req.query.radius);

  let sql = `SELECT s.address, s.short_address, s.lat, s.lng, s.weekday, s.start_time, s.end_time,
      m.id AS mid, m.slug, m.business_name, m.photo,
      c.id AS cid, c.name AS cname, c.color, c.icon
    FROM sessions s
    JOIN merchants m ON m.id = s.merchant_id
    JOIN categories c ON c.id = m.category_id
    WHERE 1=1`;
  const params = [];
  if (day >= 1 && day <= 7) {
    sql += ' AND s.weekday = ?';
    params.push(day);
  }
  if (catIds.length) {
    sql += ` AND c.id IN (${catIds.map(() => '?').join(',')})`;
    params.push(...catIds);
  }
  sql += ' ORDER BY s.weekday, s.start_time';

  let rows = db.prepare(sql).all(...params);
  if (Number.isFinite(lat) && Number.isFinite(lng) && radius > 0) {
    rows = rows.filter((x) => haversine(lat, lng, x.lat, x.lng) <= radius);
  }

  // Regroupement par lieu (≤ 25 m) ; count = marchands distincts (voir lib/places.js)
  const out = groupByPlace(rows);
  const total = new Set(rows.map((x) => x.mid)).size;
  res.json({ total, locations: out });
});

const geoLimiter = rateLimit({ windowMs: 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { error: 'Trop de recherches, patientez un instant.' } });

r.get('/geocode', geoLimiter, async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 3 || q.length > 200) return res.status(400).json({ error: 'Saisissez au moins 3 caractères.' });
  try {
    res.json({ results: await geocode(q) });
  } catch (e) {
    res.status(502).json({ error: 'Le service de recherche d’adresse est momentanément indisponible.' });
  }
});

module.exports = r;
