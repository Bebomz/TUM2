const express = require('express');
const crypto = require('crypto');
const { db } = require('./db');
const { slugify, COLOR_RE, EMAIL_RE } = require('./util');
const makeManage = require('./route-manage');

const r = express.Router();

r.get('/', (req, res) => {
  const stats = {
    merchants: db.prepare('SELECT COUNT(*) n FROM merchants').get().n,
    sessions: db.prepare('SELECT COUNT(*) n FROM sessions').get().n,
    categories: db.prepare('SELECT COUNT(*) n FROM categories').get().n,
    reports: db.prepare("SELECT COUNT(*) n FROM reports WHERE status = 'new'").get().n,
  };
  res.render('admin-index', { title: 'Administration', stats });
});

// ---- Signalements de clients ----
r.get('/signalements', (req, res) => {
  const reports = db
    .prepare(
      `SELECT r.*, m.business_name, m.slug FROM reports r JOIN merchants m ON m.id = r.merchant_id
       ORDER BY (r.status = 'new') DESC, r.created_at DESC LIMIT 200`
    )
    .all()
    .map((x) => ({ ...x, when: new Date(x.created_at.replace(' ', 'T') + 'Z').toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' }) }));
  res.render('admin-reports', { title: 'Signalements', reports });
});

r.post('/signalements/:id/traite', (req, res) => {
  const status = req.body.status === 'new' ? 'new' : 'done';
  db.prepare('UPDATE reports SET status = ? WHERE id = ?').run(status, +req.params.id);
  res.redirect('/admin/signalements');
});

// ---- Catégories ----
function listCategories() {
  return db
    .prepare('SELECT c.*, (SELECT COUNT(*) FROM merchants m WHERE m.category_id = c.id) AS used FROM categories c ORDER BY c.name')
    .all();
}

r.get('/categories', (req, res) => res.render('admin-categories', { title: 'Catégories', categories: listCategories() }));

function readCategory(b) {
  const name = String(b.name || '').trim().slice(0, 60);
  const icon = String(b.icon || '').trim().slice(0, 8) || '🛒';
  const color = String(b.color || '');
  if (!name) return { error: 'Le nom est obligatoire.' };
  if (!COLOR_RE.test(color)) return { error: 'Couleur invalide.' };
  return { name, icon, color };
}

r.post('/categories', (req, res) => {
  const c = readCategory(req.body);
  if (c.error) req.flash('error', c.error);
  else {
    try {
      db.prepare('INSERT INTO categories (name, color, icon) VALUES (?, ?, ?)').run(c.name, c.color, c.icon);
      req.flash('success', 'Catégorie ajoutée.');
    } catch (e) {
      req.flash('error', 'Cette catégorie existe déjà.');
    }
  }
  res.redirect('/admin/categories');
});

r.post('/categories/:id', (req, res) => {
  const c = readCategory(req.body);
  if (c.error) req.flash('error', c.error);
  else {
    try {
      db.prepare('UPDATE categories SET name = ?, color = ?, icon = ? WHERE id = ?').run(c.name, c.color, c.icon, +req.params.id);
      req.flash('success', 'Catégorie modifiée.');
    } catch (e) {
      req.flash('error', 'Ce nom est déjà utilisé.');
    }
  }
  res.redirect('/admin/categories');
});

r.post('/categories/:id/supprimer', (req, res) => {
  const id = +req.params.id;
  const used = db.prepare('SELECT COUNT(*) n FROM merchants WHERE category_id = ?').get(id).n;
  if (used > 0) req.flash('error', `Impossible : ${used} marchand(s) utilisent cette catégorie. Réaffectez-les d’abord.`);
  else {
    db.prepare('DELETE FROM categories WHERE id = ?').run(id);
    req.flash('success', 'Catégorie supprimée.');
  }
  res.redirect('/admin/categories');
});

// ---- Marchands ----
r.get('/marchands', (req, res) => {
  const q = String(req.query.q || '').trim();
  const like = `%${q.replace(/[%_]/g, '')}%`;
  const merchants = db
    .prepare(
      `SELECT m.id, m.business_name, m.email, m.user_id, m.created_at, c.name AS category_name, c.icon,
         (SELECT COUNT(*) FROM sessions s WHERE s.merchant_id = m.id) AS nb_sessions
       FROM merchants m JOIN categories c ON c.id = m.category_id
       WHERE ? = '' OR m.business_name LIKE ? OR m.email LIKE ? OR m.last_name LIKE ?
       ORDER BY m.created_at DESC`
    )
    .all(q, like, like, like);
  res.render('admin-merchants', { title: 'Marchands', merchants, q });
});

r.get('/marchands/nouveau', (req, res) =>
  res.render('admin-merchant-new', { title: 'Nouveau marchand', categories: db.prepare('SELECT id, name, icon FROM categories ORDER BY name').all() })
);

r.post('/marchands/nouveau', (req, res) => {
  const b = req.body;
  const t = (k, max) => String(b[k] || '').trim().slice(0, max);
  const name = t('business_name', 100);
  const email = t('email', 120);
  if (!name || !db.prepare('SELECT 1 FROM categories WHERE id = ?').get(+b.category_id) || (email && !EMAIL_RE.test(email))) {
    req.flash('error', 'Nom, catégorie valides et e-mail correct (si renseigné) sont requis.');
    return res.redirect('/admin/marchands/nouveau');
  }
  let slug;
  do slug = `${slugify(name)}-${crypto.randomBytes(2).toString('hex')}`;
  while (db.prepare('SELECT 1 FROM merchants WHERE slug = ?').get(slug));
  const id = db
    .prepare('INSERT INTO merchants (slug, business_name, category_id, first_name, last_name, email, phone) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(slug, name, +b.category_id, t('first_name', 60), t('last_name', 60), email, t('phone', 30)).lastInsertRowid;
  req.flash('success', 'Marchand créé. Ajoutez ses sessions de vente.');
  res.redirect(`/admin/marchands/${id}`);
});

// Modification / suppression d'un marchand + ses sessions
r.use(
  '/marchands/:mid',
  makeManage({
    admin: true,
    resolve: (req) => (/^\d+$/.test(req.params.mid) ? db.prepare('SELECT * FROM merchants WHERE id = ?').get(+req.params.mid) : null),
  })
);

module.exports = r;
