// Gestion d'un marchand (profil + sessions). Partagé entre l'espace marchand et l'espace admin.
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { db, DATA_DIR } = require('./db');
const { TIME_RE, EMAIL_RE } = require('./util');
const { isValid: csrfValid } = require('./csrf');
const { normalizePhone } = require('./report');

const UPLOADS = path.join(DATA_DIR, 'uploads');
const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS,
    filename: (req, f, cb) => cb(null, crypto.randomBytes(12).toString('hex') + EXT[f.mimetype]),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, f, cb) => (EXT[f.mimetype] ? cb(null, true) : cb(new Error('Format de photo non supporté (JPEG, PNG ou WebP).'))),
});

function removeFile(name) {
  if (name) fs.unlink(path.join(UPLOADS, path.basename(name)), () => {});
}

function uploadPhoto(req, res, next) {
  upload.single('photo')(req, res, (err) => {
    // Le formulaire multipart n'est lisible qu'ici : vérification CSRF après lecture.
    if (!csrfValid(req.session, req.body && req.body._csrf)) {
      if (req.file) removeFile(req.file.filename);
      return res.status(403).render('error', {
        title: 'Requête refusée',
        message: 'Votre session a expiré ou la requête est invalide. Rechargez la page puis réessayez.',
      });
    }
    if (err) {
      req.flash('error', err.code === 'LIMIT_FILE_SIZE' ? 'Photo trop lourde (5 Mo maximum).' : err.message);
      return res.redirect(req.baseUrl);
    }
    next();
  });
}

module.exports = function makeManage({ resolve, admin }) {
  const r = express.Router({ mergeParams: true });

  r.use((req, res, next) => {
    const m = resolve(req);
    if (!m) {
      if (req.user && req.user.role === 'admin' && !admin) return res.redirect('/admin');
      return res.status(404).render('error', { title: 'Introuvable', message: 'Ce marchand n’existe pas.' });
    }
    req.merchant = m;
    next();
  });

  r.get('/', (req, res) => {
    const m = req.merchant;
    res.render('manage', {
      title: admin ? `Admin · ${m.business_name}` : 'Mon espace marchand',
      merchant: m,
      sessions: db.prepare('SELECT * FROM sessions WHERE merchant_id = ? ORDER BY weekday, start_time').all(m.id),
      reports: db
        .prepare('SELECT * FROM reports WHERE merchant_id = ? ORDER BY created_at DESC LIMIT 10')
        .all(m.id)
        .map((x) => ({ ...x, when: new Date(x.created_at.replace(' ', 'T') + 'Z').toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' }) })),
      categories: db.prepare('SELECT id, name, icon FROM categories ORDER BY name').all(),
      admin,
      base: req.baseUrl,
      leaflet: true,
    });
  });

  r.post('/profil', uploadPhoto, (req, res) => {
    const m = req.merchant;
    const b = req.body;
    const t = (k, max) => String(b[k] || '').trim().slice(0, max);
    const errs = [];
    const f = {
      business_name: t('business_name', 100),
      description: t('description', 500),
      first_name: t('first_name', 60),
      last_name: t('last_name', 60),
      email: t('email', 120),
      phone: t('phone', 30).replace(/[^\d+().\s-]/g, ''),
    };
    if (!f.business_name) errs.push('Le nom de l’entreprise est obligatoire.');
    if (!db.prepare('SELECT 1 FROM categories WHERE id = ?').get(+b.category_id)) errs.push('Choisissez une catégorie.');
    if (!admin && (!f.first_name || !f.last_name)) errs.push('Nom et prénom sont obligatoires.');
    if (f.email && !EMAIL_RE.test(f.email)) errs.push('E-mail de contact invalide.');
    const showEmail = b.show_email ? 1 : 0;
    const showPhone = b.show_phone ? 1 : 0;
    const notifyWa = b.notify_whatsapp ? 1 : 0;
    if (showEmail && !f.email) errs.push('Renseignez un e-mail pour pouvoir l’afficher.');
    if (showPhone && !f.phone) errs.push('Renseignez un téléphone pour pouvoir l’afficher.');
    if (notifyWa && !normalizePhone(f.phone)) errs.push('Pour recevoir les alertes WhatsApp, renseignez un numéro valide (ex. 06 12 34 56 78 ou +33 6 12 34 56 78).');
    if (errs.length) {
      if (req.file) removeFile(req.file.filename);
      req.flash('error', errs.join(' '));
      return res.redirect(req.baseUrl);
    }
    let photo = m.photo;
    if (req.file) {
      removeFile(m.photo);
      photo = req.file.filename;
    } else if (b.remove_photo) {
      removeFile(m.photo);
      photo = null;
    }
    db.prepare(
      `UPDATE merchants SET business_name=?, category_id=?, description=?, photo=?, first_name=?, last_name=?,
         email=?, phone=?, show_email=?, show_phone=?, notify_whatsapp=? WHERE id=?`
    ).run(f.business_name, +b.category_id, f.description, photo, f.first_name, f.last_name, f.email, f.phone, showEmail, showPhone, notifyWa, m.id);
    req.flash('success', 'Profil enregistré.');
    res.redirect(req.baseUrl);
  });

  r.post('/sessions', (req, res) => {
    const b = req.body;
    const weekday = parseInt(b.weekday, 10);
    const lat = parseFloat(b.lat);
    const lng = parseFloat(b.lng);
    const address = String(b.address || '').trim().slice(0, 250);
    const shortAddress = String(b.short_address || '').trim().slice(0, 120);
    const start = String(b.start_time || '');
    const end = String(b.end_time || '');
    const errs = [];
    if (!address) errs.push('Adresse manquante.');
    if (!(Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180)) errs.push('Vérifiez l’adresse et validez son emplacement sur la carte.');
    if (!(weekday >= 1 && weekday <= 7)) errs.push('Jour invalide.');
    if (!TIME_RE.test(start) || !TIME_RE.test(end)) errs.push('Heures invalides.');
    else if (end <= start) errs.push('L’heure de fin doit être après l’heure de début.');
    if (db.prepare('SELECT COUNT(*) n FROM sessions WHERE merchant_id = ?').get(req.merchant.id).n >= 30) errs.push('Maximum 30 sessions par marchand.');
    if (errs.length) {
      req.flash('error', errs.join(' '));
      return res.redirect(req.baseUrl + '#sessions');
    }
    db.prepare('INSERT INTO sessions (merchant_id, address, short_address, lat, lng, weekday, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      req.merchant.id, address, shortAddress, lat, lng, weekday, start, end
    );
    req.flash('success', 'Session de vente ajoutée.');
    res.redirect(req.baseUrl + '#sessions');
  });

  // Suspendre / réactiver une session (vacances, maladie…) : une session suspendue disparaît de la carte,
  // de la fiche publique et de la fiche imprimable, mais reste dans l'espace du marchand.
  r.post('/sessions/:sid/etat', (req, res) => {
    const active = req.body.active === '0' ? 0 : 1;
    const done = db.prepare('UPDATE sessions SET active = ? WHERE id = ? AND merchant_id = ?').run(active, +req.params.sid, req.merchant.id).changes;
    if (done) req.flash('success', active ? 'Session réactivée : elle réapparaît sur la carte.' : 'Session suspendue : elle n’apparaît plus sur la carte.');
    res.redirect(req.baseUrl + '#sessions');
  });

  r.post('/sessions-etat', (req, res) => {
    const active = req.body.active === '0' ? 0 : 1;
    db.prepare('UPDATE sessions SET active = ? WHERE merchant_id = ?').run(active, req.merchant.id);
    req.flash('success', active ? 'Toutes vos sessions sont réactivées.' : 'Toutes vos sessions sont suspendues : vous n’apparaissez plus sur la carte.');
    res.redirect(req.baseUrl + '#sessions');
  });

  r.post('/sessions/:sid/supprimer', (req, res) => {
    db.prepare('DELETE FROM sessions WHERE id = ? AND merchant_id = ?').run(+req.params.sid, req.merchant.id);
    req.flash('success', 'Session supprimée.');
    res.redirect(req.baseUrl + '#sessions');
  });

  // Suppression du marchand (et de son compte)
  r.post('/supprimer', (req, res) => {
    const m = req.merchant;
    removeFile(m.photo);
    db.transaction(() => {
      db.prepare('DELETE FROM merchants WHERE id = ?').run(m.id);
      if (m.user_id) db.prepare("DELETE FROM users WHERE id = ? AND role = 'merchant'").run(m.user_id);
    })();
    if (admin) {
      req.flash('success', 'Marchand supprimé.');
      return res.redirect('/admin/marchands');
    }
    req.session = null;
    res.redirect('/');
  });

  return r;
};
