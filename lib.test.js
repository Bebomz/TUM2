// Tests sans dépendance externe : `npm test` (Node >= 20).
const test = require('node:test');
const assert = require('node:assert/strict');
const { groupByPlace } = require('./places');
const { ensureToken, isValid } = require('./csrf');
const { parse } = require('./env');
const { haversine, slugify, TIME_RE, COLOR_RE } = require('./util');

const row = (mid, lat, lng, weekday, start = '08:00', end = '13:00', cid = 1) => ({
  address: `adresse ${lat},${lng}`,
  lat,
  lng,
  weekday,
  start_time: start,
  end_time: end,
  mid,
  slug: `m${mid}`,
  business_name: `Marchand ${mid}`,
  photo: null,
  cid,
  cname: `Cat ${cid}`,
  color: '#43A047',
  icon: '🥕',
});

test('cahier des charges : 3 marchands avec 7 sessions au même endroit => on affiche 3', () => {
  const P = [48.8566, 2.3522];
  const rows = [
    row(1, ...P, 1), row(1, ...P, 3), row(1, ...P, 5), // marchand 1 : 3 sessions
    row(2, ...P, 1), row(2, ...P, 4),                  // marchand 2 : 2 sessions
    row(3, ...P, 2), row(3, ...P, 6),                  // marchand 3 : 2 sessions
  ];
  assert.equal(rows.length, 7);
  const places = groupByPlace(rows);
  assert.equal(places.length, 1);
  assert.equal(places[0].count, 3);
  assert.equal(places[0].merchants.find((m) => m.id === 1).sessions.length, 3);
});

test('des coordonnées très proches (< 25 m) forment un seul lieu', () => {
  const places = groupByPlace([row(1, 48.85660, 2.35220, 1), row(2, 48.85670, 2.35228, 1)]);
  assert.equal(places.length, 1);
  assert.equal(places[0].count, 2);
});

test('des lieux distants restent séparés', () => {
  const places = groupByPlace([row(1, 48.8566, 2.3522, 1), row(2, 48.8666, 2.3622, 1)]);
  assert.equal(places.length, 2);
  assert.deepEqual(places.map((p) => p.count), [1, 1]);
});

test('un même marchand sur deux lieux est compté une fois par lieu', () => {
  const places = groupByPlace([row(1, 48.8566, 2.3522, 1), row(1, 45.7640, 4.8357, 2)]);
  assert.equal(places.length, 2);
  assert.deepEqual(places.map((p) => p.count), [1, 1]);
});

test('fusion correcte de part et d’autre d’une frontière de cellule de grille', () => {
  // 0.0005 est la taille de cellule : ces deux points sont de chaque côté d'une frontière, à ~11 m.
  const places = groupByPlace([row(1, 48.85649, 2.35000, 1), row(2, 48.85651, 2.35000, 1)]);
  assert.equal(places.length, 1);
});

test('haversine : Paris -> Lyon ≈ 392 km', () => {
  const d = haversine(48.8566, 2.3522, 45.764, 4.8357);
  assert.ok(d > 385 && d < 400, String(d));
});

test('CSRF : jeton valide, invalide, absent, tableau', () => {
  const session = {};
  const t = ensureToken(session);
  assert.equal(ensureToken(session), t, 'le jeton est stable pour une session');
  assert.ok(isValid(session, t));
  assert.ok(!isValid(session, t + 'x'));
  assert.ok(!isValid(session, ''));
  assert.ok(!isValid(session, undefined));
  assert.ok(!isValid(session, [t, t]));
  assert.ok(!isValid({}, t), 'session sans jeton');
  assert.ok(!isValid(null, t));
});

test('.env : lecture clé=valeur, guillemets, commentaires, valeurs vides', () => {
  const v = parse('# commentaire\nA=1\nB = "deux mots"\nC=\nMAIL_FROM=Trouver un marchand <no-reply@x.fr>\n\nmauvaise ligne\n');
  assert.deepEqual(v, { A: '1', B: 'deux mots', C: '', MAIL_FROM: 'Trouver un marchand <no-reply@x.fr>' });
});

test('validations util', () => {
  assert.ok(TIME_RE.test('08:30') && !TIME_RE.test('24:00') && !TIME_RE.test('8:30'));
  assert.ok(COLOR_RE.test('#ff6b35') && !COLOR_RE.test('red') && !COLOR_RE.test('#ff6b3'));
  assert.equal(slugify('Boulangerie Léa & Fils !'), 'boulangerie-lea-fils');
  assert.equal(slugify('***'), 'marchand');
});

test('adresse courte : celle enregistrée, sinon repli sur l’adresse complète', () => {
  const withShort = { ...row(1, 48.85, 2.35, 1), short_address: '12 Place de la Victoire, Bordeaux' };
  assert.equal(groupByPlace([withShort])[0].short, '12 Place de la Victoire, Bordeaux');
  const fallback = { ...row(2, 44.0, 1.0, 1), address: '12, Place de la Victoire, Saint-Michel, Bordeaux, France' };
  assert.equal(groupByPlace([fallback])[0].short, '12 Place de la Victoire');
  const noNumber = { ...row(3, 45.0, 3.0, 1), address: 'Marché des Capucins, Bordeaux, Gironde' };
  assert.equal(groupByPlace([noNumber])[0].short, 'Marché des Capucins, Bordeaux');
});

// ---------- Données de démonstration (région bordelaise) ----------
const fs = require('node:fs');
const { buildDemo, seedDemo, removeDemo, DOMAIN } = require('./demo-data');

test('démo : 30 marchands valides, 2 à 4 sessions, région bordelaise', () => {
  const data = buildDemo();
  assert.equal(data.length, 30);
  assert.equal(new Set(data.map((m) => m.slug)).size, 30, 'slugs uniques');
  assert.equal(new Set(data.map((m) => m.email)).size, 30, 'e-mails uniques');
  const knownCats = [...fs.readFileSync('./db.js', 'utf8').matchAll(/\['([^']+)', '#[0-9A-Fa-f]{6}', '[^']+'\]/g)].map((x) => x[1]);
  assert.ok(knownCats.length >= 9);
  for (const m of data) {
    assert.ok(knownCats.includes(m.category), `catégorie inconnue : ${m.category}`);
    assert.ok(m.sessions.length >= 2 && m.sessions.length <= 4, `${m.name} : ${m.sessions.length} sessions`);
    assert.equal(new Set(m.sessions.map((s) => s.weekday)).size, m.sessions.length, `${m.name} : un jour en double`);
    assert.ok(new Set(m.sessions.map((s) => s.place)).size <= 3);
    for (const s of m.sessions) {
      assert.ok(s.weekday >= 1 && s.weekday <= 7);
      assert.ok(TIME_RE.test(s.start) && TIME_RE.test(s.end) && s.end > s.start);
      assert.ok(s.lat > 44.6 && s.lat < 45.0 && s.lng > -1.25 && s.lng < -0.1, 'hors région bordelaise');
    }
  }
  assert.deepEqual(buildDemo(), data, 'déterministe');
});


// Base SQLite en mémoire construite à partir du VRAI schéma et des VRAIES migrations de db.js
function makeDb() {
  const { DatabaseSync } = require('node:sqlite');
  const src = fs.readFileSync('./db.js', 'utf8');
  const raw = new DatabaseSync(':memory:');
  raw.exec(src.match(/db\.exec\(`([\s\S]*?)`\);/)[1]);
  const mig = src.match(/const MIGRATIONS = \[([\s\S]*?)\];/)[1];
  for (const m of mig.matchAll(/\['(\w+)', '(\w+)', '([^']+)'\]/g)) raw.exec(`ALTER TABLE ${m[1]} ADD COLUMN ${m[2]} ${m[3]}`);
  const ins = raw.prepare('INSERT INTO categories (name, color, icon) VALUES (?, ?, ?)');
  for (const m of src.matchAll(/\['([^']+)', '(#[0-9A-Fa-f]{6})', '([^']+)'\]/g)) ins.run(m[1], m[2], m[3]);
  const db = {
    prepare: (sql) => raw.prepare(sql),
    transaction: (fn) => () => { raw.exec('BEGIN'); try { fn(); raw.exec('COMMIT'); } catch (e) { raw.exec('ROLLBACK'); throw e; } },
  };
  return { db, raw };
}

const hasSqlite = (() => { try { require('node:sqlite'); return true; } catch (e) { return false; } })();
test('démo : insertion sur le vrai schéma, cascade, relance sans doublon, comptage par lieu', { skip: !hasSqlite && 'node:sqlite indisponible' }, () => {
  const { db, raw } = makeDb();
  const n = (t) => raw.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;

  const r = seedDemo(db, 'hash');
  assert.equal(r.merchants, 30);
  assert.equal(n('merchants'), 30);
  assert.equal(n('sessions'), r.sessions);
  seedDemo(db, 'hash'); // relance : pas de doublon
  assert.equal(n('merchants'), 30);
  assert.equal(n('sessions'), r.sessions);

  // Même requête que /api/sessions, sans filtre de jour : count = marchands distincts par lieu
  const rows = raw.prepare(`SELECT s.address, s.short_address, s.lat, s.lng, s.weekday, s.start_time, s.end_time,
      m.id AS mid, m.slug, m.business_name, m.photo, c.id AS cid, c.name AS cname, c.color, c.icon
    FROM sessions s JOIN merchants m ON m.id = s.merchant_id JOIN categories c ON c.id = m.category_id
    ORDER BY s.weekday, s.start_time`).all();
  const places = groupByPlace(rows);
  for (const p of places) {
    assert.equal(p.count, new Set(p.merchants.map((m) => m.id)).size);
    assert.ok(p.short && p.short.length > 3);
  }
  assert.ok(places.length >= 8 && places.length <= 20, `lieux : ${places.length}`);
  assert.ok(places.some((p) => p.merchants.some((m) => m.sessions.length >= 2) ), 'un marchand avec 2 sessions au même lieu (compté 1 fois)');
  // un samedi : au moins un lieu avec plusieurs marchands (marqueur avec nombre)
  const sat = groupByPlace(rows.filter((x) => x.weekday === 6));
  assert.ok(Math.max(...sat.map((p) => p.count)) >= 3, 'cluster le samedi');

  assert.equal(removeDemo(db), 30);
  assert.equal(n('users'), 0);
  assert.equal(n('merchants'), 0, 'cascade users -> merchants');
  assert.equal(n('sessions'), 0, 'cascade merchants -> sessions');
});

// ---------- Signalement d'absence ----------
const report = require('./report');

test('téléphone -> format WhatsApp international', () => {
  const n = report.normalizePhone;
  assert.equal(n('06 12 34 56 78'), '33612345678');
  assert.equal(n('+33 6 12 34 56 78'), '33612345678');
  assert.equal(n('0033612345678'), '33612345678');
  assert.equal(n('+33 (0)6 12 34 56 78'), '33612345678');
  assert.equal(n('05.56.01.02.03'), '33556010203');
  assert.equal(n('+44 7700 900123'), '447700900123');
  assert.equal(n(''), null);
  assert.equal(n('612345678'), null, 'ambigu');
  assert.equal(n('06 12 34'), null, 'trop court');
  assert.equal(n('abc'), null);
});

test('fenêtre de signalement : jour et heures dans le fuseau Europe/Paris', () => {
  // jeudi 15 octobre 2026, 08:30 UTC = 10:30 à Paris (heure d'été)
  const now = report.localNow(new Date('2026-10-15T08:30:00Z'));
  assert.deepEqual(now, { weekday: 4, time: '10:30' });
  const s = (weekday, start_time, end_time) => ({ weekday, start_time, end_time });
  assert.ok(report.isReportable(s(4, '08:00', '13:00'), now));
  assert.ok(!report.isReportable(s(4, '11:00', '13:00'), now), 'pas encore commencée');
  assert.ok(!report.isReportable(s(4, '07:00', '10:00'), now), 'déjà terminée');
  assert.ok(!report.isReportable(s(3, '08:00', '13:00'), now), 'autre jour');
  // minuit passé à Paris alors qu'il est encore la veille en UTC : dimanche 22:30 UTC = lundi 00:30
  assert.equal(report.localNow(new Date('2026-10-18T22:30:00Z')).weekday, 1);
});

test('messages : contenu utile pour le marchand, WhatsApp sans saut de ligne, lien admin', () => {
  const m = report.buildMessages({
    merchant: { id: 7, business_name: 'Ferme\ndu  Val' },
    session: { short_address: '12 Place de la Victoire, Bordeaux', address: 'long', weekday: 2, start_time: '08:00', end_time: '13:00' },
    comment: 'Personne sur place', baseUrl: 'https://trouverunmarchand.com',
  });
  assert.match(m.merchantEmail.text, /12 Place de la Victoire, Bordeaux/);
  assert.match(m.merchantEmail.text, /Mardi 08:00–13:00/);
  assert.match(m.merchantEmail.text, /suspendez vos sessions/);
  assert.match(m.merchantEmail.text, /https:\/\/trouverunmarchand\.com\/espace/);
  assert.match(m.merchantEmail.text, /Personne sur place/);
  assert.deepEqual(m.whatsappParams, ['Ferme du Val', '12 Place de la Victoire, Bordeaux – Mardi 08:00–13:00']);
  assert.match(m.adminEmail.text, /\/admin\/marchands\/7/);
});

test('WhatsApp Cloud API : requête de modèle, ignoré si non configuré, erreur remontée', async () => {
  let call;
  const ok = async (url, opt) => { call = { url, opt }; return { ok: true }; };
  const env = { WHATSAPP_TOKEN: 'tok', WHATSAPP_PHONE_ID: '123' };
  assert.deepEqual(await report.sendWhatsApp({ to: '33612345678', params: ['A', 'B'], env, fetchImpl: ok }), { sent: true });
  assert.equal(call.url, 'https://graph.facebook.com/v21.0/123/messages');
  assert.equal(call.opt.headers.Authorization, 'Bearer tok');
  const body = JSON.parse(call.opt.body);
  assert.equal(body.messaging_product, 'whatsapp');
  assert.equal(body.to, '33612345678');
  assert.equal(body.type, 'template');
  assert.equal(body.template.name, 'signalement_absence');
  assert.equal(body.template.language.code, 'fr');
  assert.deepEqual(body.template.components[0].parameters, [{ type: 'text', text: 'A' }, { type: 'text', text: 'B' }]);

  let called = false;
  const r = await report.sendWhatsApp({ to: '1', params: [], env: {}, fetchImpl: async () => { called = true; } });
  assert.equal(r.sent, false); assert.ok(r.skipped); assert.equal(called, false);

  const ko = async () => ({ ok: false, status: 401, text: async () => 'invalid token' });
  const e = await report.sendWhatsApp({ to: '1', params: [], env, fetchImpl: ko });
  assert.equal(e.sent, false); assert.match(e.error, /401 invalid token/);
});

test('signalement complet : règles, anti-abus et notifications (SQLite + faux mail/WhatsApp)', { skip: !hasSqlite && 'node:sqlite indisponible' }, async () => {
  const { db, raw } = makeDb();
  const cat = raw.prepare('SELECT id FROM categories LIMIT 1').get().id;
  raw.prepare("INSERT INTO users (id, email, password_hash, role) VALUES (1, 'marchand@ex.fr', 'x', 'merchant'), (2, 'admin@ex.fr', 'x', 'admin'), (3, 'admin2@ex.fr', 'x', 'admin')").run();
  const addMerchant = (id, uid, phone, wa) => raw.prepare("INSERT INTO merchants (id, user_id, slug, business_name, category_id, phone, notify_whatsapp) VALUES (?, ?, ?, ?, ?, ?, ?)").run(id, uid, 'm' + id, 'Marchand ' + id, cat, phone, wa);
  addMerchant(1, 1, '06 12 34 56 78', 1);
  const addSession = (id, mid, weekday, active = 1) => raw.prepare("INSERT INTO sessions (id, merchant_id, address, short_address, lat, lng, weekday, start_time, end_time, active) VALUES (?, ?, 'Place X, Bordeaux, France', '1 Place X, Bordeaux', 44.8, -0.57, ?, '08:00', '13:00', ?)").run(id, mid, weekday, active);
  addSession(10, 1, 4); // jeudi, en cours
  addSession(11, 1, 5); // vendredi
  addSession(12, 1, 4, 0); // jeudi mais suspendue

  const mails = []; const waCalls = [];
  const sendMail = async (m) => { mails.push(m); };
  const fetchImpl = async (url, opt) => { waCalls.push(JSON.parse(opt.body)); return { ok: true }; };
  const env = { WHATSAPP_TOKEN: 't', WHATSAPP_PHONE_ID: 'p' };
  const T = new Date('2026-10-15T08:30:00Z'); // jeudi 10:30 à Paris
  const run = (over) => report.processReport({ db, sessionId: 10, comment: 'Rien', ipHash: 'ip1', baseUrl: 'https://x.fr', now: T, env, sendMail, fetchImpl, ...over });
  const count = () => raw.prepare('SELECT COUNT(*) AS n FROM reports').get().n;

  assert.equal((await run({ sessionId: 999 })).status, 'not_found');
  assert.equal((await run({ sessionId: 12 })).status, 'not_found', 'session suspendue : non signalable');
  assert.equal((await run({ sessionId: 11 })).status, 'not_reportable', 'autre jour');
  assert.equal((await run({ now: new Date('2026-10-15T15:30:00Z') })).status, 'not_reportable', '17:30 : terminée');
  assert.equal(count(), 0);

  // 1er signalement : marchand (mail + WhatsApp) + 2 administrateurs
  const r1 = await run();
  assert.equal(r1.status, 'ok');
  assert.deepEqual(r1.notified, { merchantEmail: true, whatsapp: true, admins: 2 });
  assert.deepEqual(mails.map((m) => m.to).sort(), ['admin2@ex.fr', 'admin@ex.fr', 'marchand@ex.fr']);
  assert.equal(waCalls.length, 1);
  assert.equal(waCalls[0].to, '33612345678');
  const row = raw.prepare('SELECT * FROM reports WHERE id = ?').get(r1.id);
  assert.ok(row.merchant_emailed_at && row.merchant_whatsapped_at && row.admin_emailed_at);
  assert.equal(row.notify_error, null);
  assert.equal(row.comment, 'Rien'); assert.equal(row.session_id, 10);

  // même client : doublon, aucun envoi
  assert.equal((await run()).status, 'duplicate');
  assert.equal(count(), 1); assert.equal(mails.length, 3);

  // autre client dans les 4 h : enregistré, admin prévenu, marchand NON ré-alerté
  mails.length = 0; waCalls.length = 0;
  const r2 = await run({ ipHash: 'ip2' });
  assert.deepEqual(r2.notified, { merchantEmail: false, whatsapp: false, admins: 2 });
  assert.equal(mails.length, 2); assert.equal(waCalls.length, 0); assert.equal(count(), 2);

  // 5 h plus tard (toujours dans la session ? non : 15:30 Paris) -> on prend un autre jour pour tester le dégel
  addSession(13, 1, 4); raw.prepare("UPDATE sessions SET end_time = '23:59' WHERE id = 13").run();
  const late = new Date('2026-10-15T14:00:00Z'); // 16:00 Paris
  mails.length = 0;
  const r3 = await run({ sessionId: 13, ipHash: 'ip3', now: late });
  assert.equal(r3.notified.merchantEmail, true);

  // WhatsApp refusé par le marchand : pas d'appel, mails oui
  raw.prepare('UPDATE merchants SET notify_whatsapp = 0').run();
  waCalls.length = 0; addSession(14, 1, 4);
  raw.prepare("UPDATE sessions SET start_time='00:00', end_time='23:59' WHERE id = 14").run();
  const r4 = await run({ sessionId: 14, ipHash: 'ip4' });
  assert.equal(r4.notified.whatsapp, false); assert.equal(waCalls.length, 0); assert.equal(r4.notified.merchantEmail, true);

  // panne d'envoi : le signalement est conservé, l'erreur est tracée, le reste continue
  raw.prepare('UPDATE merchants SET notify_whatsapp = 1').run();
  addSession(15, 1, 4); raw.prepare("UPDATE sessions SET start_time='00:00', end_time='23:59' WHERE id = 15").run();
  const failing = async (m) => { if (m.to === 'marchand@ex.fr') throw new Error('SMTP down'); };
  const r5 = await run({ sessionId: 15, ipHash: 'ip5', sendMail: failing, fetchImpl: async () => ({ ok: false, status: 500, text: async () => 'boom' }) });
  assert.equal(r5.status, 'ok'); assert.equal(r5.notified.admins, 2); assert.equal(r5.notified.merchantEmail, false);
  const failed = raw.prepare('SELECT notify_error FROM reports WHERE id = ?').get(r5.id).notify_error;
  assert.match(failed, /SMTP down/); assert.match(failed, /WhatsApp HTTP 500/);

  // adresse admin forcée par variable d'environnement
  mails.length = 0; addSession(16, 1, 4); raw.prepare("UPDATE sessions SET start_time='00:00', end_time='23:59' WHERE id = 16").run();
  await run({ sessionId: 16, ipHash: 'ip6', env: { ...env, REPORT_ADMIN_EMAIL: 'alerte@ex.fr, autre@ex.fr' } });
  assert.deepEqual(mails.filter((m) => /alerte|autre/.test(m.to)).map((m) => m.to), ['alerte@ex.fr', 'autre@ex.fr']);
});

