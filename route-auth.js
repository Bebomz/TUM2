const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { db } = require('./db');
const { slugify, EMAIL_RE } = require('./util');
const { sendMail } = require('./mail');

const r = express.Router();
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    req.flash('error', 'Trop de tentatives. Réessayez dans quelques minutes.');
    res.redirect(req.get('referer') || '/');
  },
});

const categories = () => db.prepare('SELECT id, name, icon FROM categories ORDER BY name').all();
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

function uniqueSlug(name) {
  for (;;) {
    const s = `${slugify(name)}-${crypto.randomBytes(2).toString('hex')}`;
    if (!db.prepare('SELECT 1 FROM merchants WHERE slug = ?').get(s)) return s;
  }
}

function loginAndRedirect(req, res, user) {
  // Nouvelle session à la connexion (évite la fixation de session), en gardant le message flash.
  const flash = req.session.flash;
  req.session = { uid: user.id };
  if (flash) req.session.flash = flash;
  res.redirect(user.role === 'admin' ? '/admin' : '/espace');
}

r.get('/inscription', (req, res) => {
  if (req.user) return res.redirect('/espace');
  res.render('register', { title: 'Inscription marchand', categories: categories(), form: {} });
});

r.post('/inscription', limiter, (req, res) => {
  const b = req.body;
  const t = (k) => String(b[k] || '').trim();
  const form = { email: t('email'), business_name: t('business_name'), category_id: t('category_id'), first_name: t('first_name'), last_name: t('last_name') };
  const errs = [];
  const email = form.email.toLowerCase();
  if (!EMAIL_RE.test(email)) errs.push('Adresse e-mail invalide.');
  if (String(b.password || '').length < 8) errs.push('Le mot de passe doit contenir au moins 8 caractères.');
  if (b.password !== b.password2) errs.push('Les deux mots de passe ne correspondent pas.');
  if (!form.business_name) errs.push('Le nom de l’entreprise est obligatoire.');
  if (!form.first_name || !form.last_name) errs.push('Nom et prénom sont obligatoires.');
  if (!db.prepare('SELECT 1 FROM categories WHERE id = ?').get(+form.category_id)) errs.push('Choisissez une catégorie.');
  if (!errs.length && db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) errs.push('Un compte existe déjà avec cet e-mail.');
  if (errs.length) {
    return res.status(400).render('register', { title: 'Inscription marchand', categories: categories(), form, error: errs.join(' ') });
  }
  const user = db.transaction(() => {
    const uid = db
      .prepare("INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'merchant')")
      .run(email, bcrypt.hashSync(b.password, 10)).lastInsertRowid;
    db.prepare(
      'INSERT INTO merchants (user_id, slug, business_name, category_id, first_name, last_name, email) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(uid, uniqueSlug(form.business_name), form.business_name.slice(0, 100), +form.category_id, form.first_name.slice(0, 60), form.last_name.slice(0, 60), email);
    return { id: uid, role: 'merchant' };
  })();
  req.flash('success', 'Bienvenue ! Ajoutez maintenant vos lieux et horaires de vente.');
  loginAndRedirect(req, res, user);
});

r.get('/connexion', (req, res) => {
  if (req.user) return res.redirect(req.user.role === 'admin' ? '/admin' : '/espace');
  res.render('login', { title: 'Connexion', email: '' });
});

r.post('/connexion', limiter, (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!u || !bcrypt.compareSync(String(req.body.password || ''), u.password_hash)) {
    return res.status(401).render('login', { title: 'Connexion', email, error: 'E-mail ou mot de passe incorrect.' });
  }
  loginAndRedirect(req, res, u);
});

r.post('/deconnexion', (req, res) => {
  req.session = null;
  res.redirect('/');
});

r.get('/mot-de-passe-oublie', (req, res) => res.render('forgot', { title: 'Mot de passe oublié' }));

r.post('/mot-de-passe-oublie', limiter, async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const u = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (u) {
      const token = crypto.randomBytes(32).toString('hex');
      db.prepare('UPDATE users SET reset_token_hash = ?, reset_expires = ? WHERE id = ?').run(sha(token), Date.now() + 3600 * 1000, u.id);
      await sendMail({
        to: email,
        subject: 'Réinitialisation de votre mot de passe — Trouver un marchand',
        text: `Bonjour,\n\nPour choisir un nouveau mot de passe, ouvrez ce lien (valable 1 heure) :\n${res.locals.baseUrl}/reinitialisation/${token}\n\nSi vous n’êtes pas à l’origine de cette demande, ignorez ce message.`,
      }).catch((e) => console.error('Envoi mail échoué', e.message));
    }
    req.flash('success', 'Si un compte existe pour cet e-mail, un lien de réinitialisation vient d’être envoyé.');
    res.redirect('/connexion');
  } catch (e) {
    next(e);
  }
});

function userByToken(token) {
  return db.prepare('SELECT id FROM users WHERE reset_token_hash = ? AND reset_expires > ?').get(sha(String(token)), Date.now());
}

r.get('/reinitialisation/:token', (req, res) => {
  if (!userByToken(req.params.token)) {
    req.flash('error', 'Ce lien est invalide ou expiré. Refaites une demande.');
    return res.redirect('/mot-de-passe-oublie');
  }
  res.render('reset', { title: 'Nouveau mot de passe', token: req.params.token });
});

r.post('/reinitialisation/:token', limiter, (req, res) => {
  const u = userByToken(req.params.token);
  if (!u) {
    req.flash('error', 'Ce lien est invalide ou expiré. Refaites une demande.');
    return res.redirect('/mot-de-passe-oublie');
  }
  const { password, password2 } = req.body;
  if (String(password || '').length < 8 || password !== password2) {
    return res.status(400).render('reset', {
      title: 'Nouveau mot de passe',
      token: req.params.token,
      error: 'Mot de passe de 8 caractères minimum, identique dans les deux champs.',
    });
  }
  db.prepare('UPDATE users SET password_hash = ?, reset_token_hash = NULL, reset_expires = NULL WHERE id = ?').run(bcrypt.hashSync(password, 10), u.id);
  req.flash('success', 'Mot de passe mis à jour. Vous pouvez vous connecter.');
  res.redirect('/connexion');
});

module.exports = r;
