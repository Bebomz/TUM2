const express = require('express');
const QRCode = require('qrcode');
const { db } = require('./db');

const r = express.Router();

const safeJson = (v) => JSON.stringify(v).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

r.get('/', (req, res) => {
  const categories = db.prepare('SELECT id, name, color, icon FROM categories ORDER BY name').all();
  res.render('home', { title: null, categories, categoriesJson: safeJson(categories) });
});

function loadMerchant(slug) {
  const m = db
    .prepare(
      `SELECT m.*, c.name AS category_name, c.color AS category_color, c.icon AS category_icon
       FROM merchants m JOIN categories c ON c.id = m.category_id WHERE m.slug = ?`
    )
    .get(slug);
  if (!m) return null;
  const sessions = db.prepare('SELECT * FROM sessions WHERE merchant_id = ? AND active = 1 ORDER BY weekday, start_time').all(m.id);
  // Seules les informations publiques sont exposées aux vues
  const pub = {
    id: m.id,
    slug: m.slug,
    business_name: m.business_name,
    description: m.description,
    photo: m.photo,
    category_name: m.category_name,
    category_color: m.category_color,
    category_icon: m.category_icon,
    email: m.show_email && m.email ? m.email : '',
    phone: m.show_phone && m.phone ? m.phone : '',
  };
  return { merchant: pub, sessions };
}

r.get('/marchand/:slug', (req, res) => {
  const data = loadMerchant(req.params.slug);
  if (!data) return res.status(404).render('error', { title: 'Marchand introuvable', message: 'Cette fiche n’existe pas ou a été supprimée.' });
  const url = `${res.locals.baseUrl}/marchand/${data.merchant.slug}`;
  const isOwner =
    req.user &&
    (req.user.role === 'admin' || db.prepare('SELECT 1 FROM merchants WHERE id = ? AND user_id = ?').get(data.merchant.id, req.user.id));
  res.render('merchant', {
    ...data,
    title: data.merchant.business_name,
    url,
    isOwner: Boolean(isOwner),
    leaflet: true,
    sessionsJson: safeJson(data.sessions.map((s) => ({ lat: s.lat, lng: s.lng, address: s.address, weekday: s.weekday, start: s.start_time, end: s.end_time }))),
    colorJson: safeJson(data.merchant.category_color),
    iconJson: safeJson(data.merchant.category_icon),
  });
});

r.get('/marchand/:slug/imprimer', async (req, res, next) => {
  try {
    const data = loadMerchant(req.params.slug);
    if (!data) return res.status(404).render('error', { title: 'Marchand introuvable', message: 'Cette fiche n’existe pas.' });
    const url = `${res.locals.baseUrl}/marchand/${data.merchant.slug}`;
    const qrSvg = await QRCode.toString(url, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#1f2430', light: '#0000' } });
    res.render('print', { ...data, title: `Fiche ${data.merchant.business_name}`, url, qrSvg });
  } catch (e) {
    next(e);
  }
});

// Soutien financier (Stripe Checkout si configuré)
r.get('/soutenir', (req, res) => {
  res.render('support', { title: 'Soutenir le site', stripeReady: Boolean(process.env.STRIPE_SECRET_KEY), thanks: req.query.merci === '1' });
});

r.post('/soutenir/checkout', async (req, res, next) => {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      req.flash('error', 'Le paiement en ligne n’est pas encore activé.');
      return res.redirect('/soutenir');
    }
    const euros = Math.round(Number(String(req.body.amount || '').replace(',', '.')));
    if (!(euros >= 1 && euros <= 1000)) {
      req.flash('error', 'Choisissez un montant entre 1 € et 1 000 €.');
      return res.redirect('/soutenir');
    }
    const body = new URLSearchParams({
      mode: 'payment',
      success_url: `${res.locals.baseUrl}/soutenir?merci=1`,
      cancel_url: `${res.locals.baseUrl}/soutenir`,
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': 'eur',
      'line_items[0][price_data][unit_amount]': String(euros * 100),
      'line_items[0][price_data][product_data][name]': 'Soutien à Trouver un marchand',
    });
    if (req.user) body.set('customer_email', req.user.email);
    const resp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(10000),
    });
    const json = await resp.json();
    if (!resp.ok || !json.url) {
      console.error('Stripe', json);
      req.flash('error', 'Impossible de démarrer le paiement. Réessayez plus tard.');
      return res.redirect('/soutenir');
    }
    res.redirect(303, json.url);
  } catch (e) {
    next(e);
  }
});

module.exports = r;
