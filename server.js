require('./env').load(); // charge .env (sans écraser les variables déjà définies)

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const cookieSession = require('cookie-session');
const { db, DATA_DIR } = require('./db');
const { DAYS } = require('./util');
const { ensureToken, isValid } = require('./csrf');

const isProd = process.env.NODE_ENV === 'production';
const app = express();

app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', __dirname);
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('X-Frame-Options', 'SAMEORIGIN');
  next();
});

app.use('/uploads', express.static(path.join(DATA_DIR, 'uploads'), { maxAge: '7d' }));
// Tous les fichiers sont à la racine : on ne sert QUE cette liste blanche (jamais server.js, .env, etc.).
const ASSETS = {
  '/css/style.css': 'style.css',
  '/css/print.css': 'print.css',
  '/js/map.js': 'client-map.js',
  '/js/manage.js': 'client-manage.js',
  '/js/merchant.js': 'client-merchant.js',
  '/js/print.js': 'client-print.js',
};
Object.entries(ASSETS).forEach(([url, file]) => {
  app.get(url, (req, res) => res.sendFile(path.join(__dirname, file), { maxAge: isProd ? '1h' : 0 }));
});
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(express.json({ limit: '100kb' }));

let secret = process.env.SESSION_SECRET;
if (!secret) {
  secret = crypto.randomBytes(32).toString('hex');
  console.warn('⚠️  SESSION_SECRET non défini : les connexions seront perdues à chaque redémarrage.');
}
app.use(
  cookieSession({
    name: 'tum',
    keys: [secret],
    maxAge: 30 * 24 * 3600 * 1000,
    sameSite: 'lax',
    httpOnly: true,
    secure: isProd,
  })
);

app.get('/health', (req, res) => res.send('ok'));

app.use((req, res, next) => {
  req.flash = (type, msg) => {
    req.session.flash = { type, msg };
  };
  res.locals.flash = req.session.flash || null;
  if (req.session.flash) delete req.session.flash;
  res.locals.user = null;
  if (req.session.uid) {
    const u = db.prepare('SELECT id, email, role FROM users WHERE id = ?').get(req.session.uid);
    if (u) {
      req.user = u;
      res.locals.user = u;
    } else {
      req.session = null;
      req.session = {};
    }
  }
  res.locals.csrfToken = ensureToken(req.session);
  res.locals.baseUrl = (process.env.BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  res.locals.days = DAYS;
  next();
});

// Protection CSRF : toute requête POST doit porter le jeton de la session (champ caché _csrf).
// Les formulaires multipart (envoi de photo) ne sont lisibles qu'après multer : la vérification
// se fait alors dans la route /profil ; tout autre POST multipart est refusé.
app.use((req, res, next) => {
  if (req.method !== 'POST') return next();
  const refuse = () =>
    res.status(403).render('error', {
      title: 'Requête refusée',
      message: 'Votre session a expiré ou la requête est invalide. Rechargez la page puis réessayez.',
    });
  if ((req.headers['content-type'] || '').startsWith('multipart/')) {
    return /\/profil$/.test(req.path) ? next() : refuse();
  }
  if (!isValid(req.session, req.body && req.body._csrf)) return refuse();
  next();
});

function requireAuth(req, res, next) {
  if (!req.user) return res.redirect('/connexion');
  next();
}
function requireAdmin(req, res, next) {
  if (!req.user) return res.redirect('/connexion');
  if (req.user.role !== 'admin') return res.status(403).render('error', { title: 'Accès refusé', message: 'Accès réservé à l’administrateur.' });
  next();
}

// Compte administrateur
(function bootstrapAdmin() {
  let email = process.env.ADMIN_EMAIL;
  let password = process.env.ADMIN_PASSWORD;
  if (!email && !isProd) {
    email = 'admin@example.com';
    password = 'admin1234';
    console.log('ℹ️  Mode dev : compte admin par défaut admin@example.com / admin1234');
  }
  if (!email) return;
  email = email.trim().toLowerCase();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(existing.id);
  } else if (password) {
    db.prepare("INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'admin')").run(email, bcrypt.hashSync(password, 10));
    console.log(`✅ Compte administrateur créé : ${email}`);
  }
})();

app.use('/api', require('./route-api'));
app.use(require('./route-public'));
app.use(require('./route-auth'));
app.use('/espace', requireAuth, require('./route-espace'));
app.use('/admin', requireAdmin, require('./route-admin'));

app.use((req, res) => res.status(404).render('error', { title: 'Page introuvable', message: 'Cette page n’existe pas.' }));
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).render('error', { title: 'Erreur', message: 'Une erreur est survenue. Réessayez dans un instant.' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`🚀 Trouver un marchand sur http://localhost:${port}`));
