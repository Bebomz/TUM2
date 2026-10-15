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
