// Données de démonstration : 30 marchands FICTIFS sur la région bordelaise.
// Les lieux sont de vraies places/centres-villes (coordonnées approximatives), les marchands,
// personnes, e-mails (@demo.trouverunmarchand.test) et téléphones (plages fictives de l'ARCEP) sont inventés.
//
//   npm run seed:demo           crée (ou recrée) les marchands de démo
//   npm run seed:demo:remove    les supprime (compte, fiche et sessions)
const { slugify } = require('./util');

const DOMAIN = 'demo.trouverunmarchand.test';
const PASSWORD = 'demo1234';

// m = marché du matin, s = fin d'après-midi / soir. Jours : 1 = lundi … 7 = dimanche.
const PLACES = [
  { key: 'capucins', w: 4, name: 'Place des Capucins, Bordeaux', addr: 'Place des Capucins, 33800 Bordeaux, France', lat: 44.8329, lng: -0.5667, slots: [[2, 'm'], [3, 'm'], [4, 'm'], [5, 'm'], [6, 'm'], [7, 'm']] },
  { key: 'chartrons', w: 3, name: 'Marché des Chartrons, Bordeaux', addr: 'Place du Marché des Chartrons, 33000 Bordeaux, France', lat: 44.8517, lng: -0.5733, slots: [[3, 'm'], [6, 'm'], [7, 'm']] },
  { key: 'victoire', w: 3, name: 'Place de la Victoire, Bordeaux', addr: 'Place de la Victoire, 33000 Bordeaux, France', lat: 44.831, lng: -0.5738, slots: [[1, 's'], [3, 'm'], [5, 's'], [6, 'm']] },
  { key: 'gambetta', w: 2, name: 'Place Gambetta, Bordeaux', addr: 'Place Gambetta, 33000 Bordeaux, France', lat: 44.8427, lng: -0.5826, slots: [[2, 'm'], [4, 's'], [6, 'm']] },
  { key: 'stmichel', w: 2, name: 'Place Saint-Michel, Bordeaux', addr: 'Place Saint-Michel, 33800 Bordeaux, France', lat: 44.834, lng: -0.564, slots: [[3, 'm'], [5, 'm'], [7, 'm']] },
  { key: 'jullian', w: 2, name: 'Place Camille Jullian, Bordeaux', addr: 'Place Camille Jullian, 33000 Bordeaux, France', lat: 44.8393, lng: -0.5726, slots: [[2, 'm'], [5, 's']] },
  { key: 'merignac', w: 2, name: 'Centre-ville, Mérignac', addr: 'Centre-ville, 33700 Mérignac, France', lat: 44.8386, lng: -0.6466, slots: [[3, 'm'], [6, 'm'], [7, 'm']] },
  { key: 'pessac', w: 2, name: 'Centre-ville, Pessac', addr: 'Centre-ville, 33600 Pessac, France', lat: 44.8064, lng: -0.6311, slots: [[3, 'm'], [5, 's'], [7, 'm']] },
  { key: 'talence', w: 2, name: 'Centre-ville, Talence', addr: 'Centre-ville, 33400 Talence, France', lat: 44.8071, lng: -0.5886, slots: [[2, 'm'], [4, 's'], [6, 'm']] },
  { key: 'begles', w: 1, name: 'Centre-ville, Bègles', addr: 'Centre-ville, 33130 Bègles, France', lat: 44.8082, lng: -0.5489, slots: [[3, 'm'], [6, 'm']] },
  { key: 'bouscat', w: 1, name: 'Centre-ville, Le Bouscat', addr: 'Centre-ville, 33110 Le Bouscat, France', lat: 44.8682, lng: -0.6, slots: [[4, 'm'], [7, 'm']] },
  { key: 'cenon', w: 1, name: 'Centre-ville, Cenon', addr: 'Centre-ville, 33150 Cenon, France', lat: 44.8566, lng: -0.5253, slots: [[3, 'm'], [6, 'm']] },
  { key: 'lormont', w: 1, name: 'Centre-ville, Lormont', addr: 'Centre-ville, 33310 Lormont, France', lat: 44.88, lng: -0.519, slots: [[5, 's'], [7, 'm']] },
  { key: 'villenave', w: 1, name: "Centre-ville, Villenave-d'Ornon", addr: "Centre-ville, 33140 Villenave-d'Ornon, France", lat: 44.7756, lng: -0.5619, slots: [[4, 'm'], [6, 'm']] },
  { key: 'gradignan', w: 1, name: 'Centre-ville, Gradignan', addr: 'Centre-ville, 33170 Gradignan, France', lat: 44.7716, lng: -0.6144, slots: [[3, 'm'], [7, 'm']] },
  { key: 'eysines', w: 1, name: 'Centre-ville, Eysines', addr: 'Centre-ville, 33320 Eysines, France', lat: 44.883, lng: -0.646, slots: [[5, 's'], [6, 'm']] },
  { key: 'blanquefort', w: 1, name: 'Centre-ville, Blanquefort', addr: 'Centre-ville, 33290 Blanquefort, France', lat: 44.9143, lng: -0.6291, slots: [[4, 'm'], [7, 'm']] },
  { key: 'stmedard', w: 1, name: 'Centre-ville, Saint-Médard-en-Jalles', addr: 'Centre-ville, 33160 Saint-Médard-en-Jalles, France', lat: 44.8993, lng: -0.7195, slots: [[3, 'm'], [6, 'm']] },
  { key: 'libourne', w: 1, name: 'Centre-ville, Libourne', addr: 'Centre-ville, 33500 Libourne, France', lat: 44.915, lng: -0.2425, slots: [[2, 'm'], [5, 'm'], [7, 'm']] },
  { key: 'arcachon', w: 1, name: 'Marché d’Arcachon', addr: "Centre-ville, 33120 Arcachon, France", lat: 44.659, lng: -1.165, slots: [[3, 'm'], [5, 'm'], [6, 'm'], [7, 'm']] },
  { key: 'stemilion', w: 1, name: 'Centre-ville, Saint-Émilion', addr: 'Centre-ville, 33330 Saint-Émilion, France', lat: 44.8933, lng: -0.1553, slots: [[7, 'm']] },
];

const HOURS = { m: [['07:00', '13:00'], ['06:30', '13:00'], ['08:00', '12:30'], ['07:30', '13:30']], s: [['16:30', '19:30'], ['17:00', '20:00'], ['16:00', '19:00']] };

const DESC = {
  'Fruits & légumes': ['Fruits et légumes de saison, cultivés en Gironde et récoltés la veille.', 'Producteur local : légumes de plein champ, herbes fraîches et fruits du verger.', 'Primeur passionné : produits de saison, sélectionnés chaque matin.'],
  'Boucherie & charcuterie': ['Viandes de la région, découpe à la demande et charcuterie maison.', 'Bœuf, veau et agneau du Sud-Ouest, préparations artisanales.'],
  Poissonnerie: ['Poissons et fruits de mer du Bassin et de l’Atlantique, arrivage du jour.', 'Huîtres, crevettes et poissons frais, ouverture à la demande.'],
  'Fromage & produits laitiers': ['Fromages fermiers, chèvres frais et affinés, beurre et yaourts.', 'Sélection de fromages de la région et d’ailleurs, à déguster sur place.'],
  'Boulangerie & pâtisserie': ['Pains au levain, viennoiseries et pâtisseries fabriqués chaque nuit.', 'Canelés, tartes et pains spéciaux, cuits au feu de bois.'],
  'Pizzas & street food': ['Cuisine de rue faite minute avec des produits locaux.', 'À emporter ou à partager : recettes généreuses, ingrédients frais.'],
  'Fleurs & plantes': ['Bouquets de saison, plantes en pot et aromatiques.', 'Fleurs coupées, compositions sur mesure et jeunes plants.'],
  'Vêtements & accessoires': ['Vêtements et accessoires en matières naturelles, petites séries.'],
  Autre: ['Produits artisanaux du terroir : miel, confitures, épices et thés.'],
};

// [nom, catégorie] — 30 marchands fictifs
const MERCHANTS = [
  ['Maraîchers de Blanquefort', 'Fruits & légumes'], ['Ferme des Graves', 'Fruits & légumes'], ['Les Jardins de la Jalle', 'Fruits & légumes'],
  ['Primeur Garonne', 'Fruits & légumes'], ['Verger du Médoc', 'Fruits & légumes'],
  ['Boucherie Médoc Tradition', 'Boucherie & charcuterie'], ['Charcuterie Lagarde', 'Boucherie & charcuterie'],
  ['Rôtisserie du Sud-Ouest', 'Boucherie & charcuterie'], ['Ferme des Bœufs de Bazas', 'Boucherie & charcuterie'],
  ['Huîtres du Bassin chez Marcel', 'Poissonnerie'], ['Poissonnerie Marée Haute', 'Poissonnerie'], ['Le Banc des Pêcheurs', 'Poissonnerie'],
  ['Fromagerie des Deux Vallées', 'Fromage & produits laitiers'], ['Chèvrerie des Coteaux', 'Fromage & produits laitiers'], ['Laiterie Fermière du Libournais', 'Fromage & produits laitiers'],
  ['Canelés Maison Dubois', 'Boulangerie & pâtisserie'], ['Le Fournil du Marché', 'Boulangerie & pâtisserie'], ['Pains & Cie', 'Boulangerie & pâtisserie'], ['Douceurs Girondines', 'Boulangerie & pâtisserie'],
  ['Pizzas Garonne Feu', 'Pizzas & street food'], ['Crêpes & Galettes Ker Bordeaux', 'Pizzas & street food'], ['Le Camion Bacalan', 'Pizzas & street food'], ['Burgers du Port de la Lune', 'Pizzas & street food'],
  ['Fleurs du Médoc', 'Fleurs & plantes'], ['Pépinière des Landes', 'Fleurs & plantes'], ['Bouquets de la Jalle', 'Fleurs & plantes'],
  ['Lin & Coton Atelier', 'Vêtements & accessoires'], ['Chapeaux du Bassin', 'Vêtements & accessoires'],
  ['Miel des Graves', 'Autre'], ['Épices & Thés du Monde', 'Autre'],
];
const FIRST = ['Léa', 'Hugo', 'Camille', 'Mathis', 'Inès', 'Louis', 'Manon', 'Nathan', 'Chloé', 'Théo', 'Sarah', 'Antoine', 'Julie', 'Maxime', 'Océane'];
const LAST = ['Dubois', 'Lagarde', 'Castets', 'Duprat', 'Laffitte', 'Darriet', 'Lacoste', 'Moulin', 'Bernard', 'Cazaux', 'Dupouy', 'Fourcade', 'Lasserre', 'Peyrelongue', 'Marsan'];

// Générateur pseudo-aléatoire déterministe (mêmes données à chaque exécution)
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildDemo() {
  const rand = rng(33000);
  const pick = (a) => a[Math.floor(rand() * a.length)];
  // pool (lieu × jour), pondéré : le centre de Bordeaux revient plus souvent => marqueurs à plusieurs marchands
  const pool = [];
  PLACES.forEach((p) => p.slots.forEach(([day, kind]) => { for (let i = 0; i < p.w; i++) pool.push({ p, day, kind }); }));

  return MERCHANTS.map(([name, category], i) => {
    const n = 2 + Math.floor(rand() * 3); // 2 à 4 sessions
    const sessions = [];
    const days = new Set();
    const places = new Set();
    let guard = 0;
    while (sessions.length < n && guard++ < 500) {
      const c = pick(pool);
      if (days.has(c.day)) continue; // une session par jour au plus
      if (!places.has(c.p.key) && places.size >= 3) continue; // 3 lieux au plus
      days.add(c.day); places.add(c.p.key);
      const [start, end] = pick(HOURS[c.kind]);
      sessions.push({ weekday: c.day, start, end, address: c.p.addr, short: c.p.name, lat: c.p.lat, lng: c.p.lng, place: c.p.key });
    }
    sessions.sort((a, b) => a.weekday - b.weekday);
    const num = String(i + 1).padStart(2, '0');
    return {
      name,
      category,
      slug: `${slugify(name)}-${(0x1000 + i).toString(16)}`,
      description: pick(DESC[category]),
      first: pick(FIRST),
      last: pick(LAST),
      email: `demo${num}@${DOMAIN}`,
      phone: `06 39 98 ${num} ${String(10 + Math.floor(rand() * 89))}`,
      showEmail: rand() < 0.35 ? 1 : 0,
      showPhone: rand() < 0.7 ? 1 : 0,
      sessions,
    };
  });
}

// `db` : better-sqlite3 (prepare/transaction). Supprime d'abord d'éventuelles données de démo.
function removeDemo(db) {
  return db.prepare('DELETE FROM users WHERE email LIKE ?').run(`%@${DOMAIN}`).changes;
}

function seedDemo(db, passwordHash) {
  const catId = new Map(db.prepare('SELECT id, name FROM categories').all().map((c) => [c.name, c.id]));
  const fallback = [...catId.values()][0];
  const insUser = db.prepare("INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'merchant')");
  const insMerchant = db.prepare(
    `INSERT INTO merchants (user_id, slug, business_name, category_id, description, first_name, last_name, email, phone, show_email, show_phone)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insSession = db.prepare(
    'INSERT INTO sessions (merchant_id, address, short_address, lat, lng, weekday, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const data = buildDemo();
  db.transaction(() => {
    removeDemo(db);
    for (const m of data) {
      const uid = insUser.run(m.email, passwordHash).lastInsertRowid;
      const mid = insMerchant.run(uid, m.slug, m.name, catId.get(m.category) || fallback, m.description, m.first, m.last, m.email, m.phone, m.showEmail, m.showPhone).lastInsertRowid;
      for (const s of m.sessions) insSession.run(mid, s.address, s.short, s.lat, s.lng, s.weekday, s.start, s.end);
    }
  })();
  return { merchants: data.length, sessions: data.reduce((n, m) => n + m.sessions.length, 0) };
}

module.exports = { buildDemo, seedDemo, removeDemo, PLACES, DOMAIN, PASSWORD };
