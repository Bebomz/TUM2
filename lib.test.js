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

const hasSqlite = (() => { try { require('node:sqlite'); return true; } catch (e) { return false; } })();
test('démo : insertion sur le vrai schéma, cascade, relance sans doublon, comptage par lieu', { skip: !hasSqlite && 'node:sqlite indisponible' }, () => {
  const { DatabaseSync } = require('node:sqlite');
  const src = fs.readFileSync('./db.js', 'utf8');
  const raw = new DatabaseSync(':memory:');
  raw.exec(src.match(/db\.exec\(`([\s\S]*?)`\);/)[1]);
  raw.exec('ALTER TABLE sessions ADD COLUMN short_address TEXT'); // migration de db.js
  const ins = raw.prepare('INSERT INTO categories (name, color, icon) VALUES (?, ?, ?)');
  for (const m of src.matchAll(/\['([^']+)', '(#[0-9A-Fa-f]{6})', '([^']+)'\]/g)) ins.run(m[1], m[2], m[3]);
  const db = {
    prepare: (sql) => raw.prepare(sql),
    transaction: (fn) => () => { raw.exec('BEGIN'); try { fn(); raw.exec('COMMIT'); } catch (e) { raw.exec('ROLLBACK'); throw e; } },
  };
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
