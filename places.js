// Regroupe des sessions de vente par lieu.
//
// Règle métier : un lieu affiche le nombre de marchands DISTINCTS, pas le nombre de sessions.
// Exemple : 3 marchands avec 7 sessions au même endroit => count = 3.
//
// Deux sessions sont "au même endroit" si elles sont à moins de MERGE_KM l'une de l'autre
// (les adresses saisies différemment pour une même place donnent des coordonnées voisines).
const { haversine } = require('./util');

// Adresse courte : celle enregistrée, sinon repli sur les deux premiers segments de l'adresse complète
function shortOf(row) {
  if (row.short_address) return row.short_address;
  const parts = String(row.address || '').split(',').map((x) => x.trim()).filter(Boolean);
  return /^\d+\w?$/.test(parts[0] || '') && parts[1] ? `${parts[0]} ${parts[1]}` : parts.slice(0, 2).join(', ');
}

const MERGE_KM = 0.025; // 25 m
const CELL = 0.0005; // ~55 m en latitude : un voisinage 3x3 couvre toujours MERGE_KM

function groupByPlace(rows) {
  const places = [];
  const grid = new Map(); // "i,j" -> [place]

  const findPlace = (lat, lng) => {
    const ci = Math.floor(lat / CELL);
    const cj = Math.floor(lng / CELL);
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        const bucket = grid.get(`${ci + di},${cj + dj}`);
        if (!bucket) continue;
        for (const p of bucket) if (haversine(p.lat, p.lng, lat, lng) <= MERGE_KM) return p;
      }
    }
    return null;
  };

  for (const x of rows) {
    let p = findPlace(x.lat, x.lng);
    if (!p) {
      p = { lat: x.lat, lng: x.lng, address: x.address, short: shortOf(x), merchants: new Map() };
      places.push(p);
      const key = `${Math.floor(x.lat / CELL)},${Math.floor(x.lng / CELL)}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(p);
    }
    let m = p.merchants.get(x.mid);
    if (!m) {
      m = {
        id: x.mid,
        slug: x.slug,
        name: x.business_name,
        photo: x.photo,
        category: { id: x.cid, name: x.cname, color: x.color, icon: x.icon },
        sessions: [],
      };
      p.merchants.set(x.mid, m);
    }
    m.sessions.push({ id: x.id, weekday: x.weekday, start: x.start_time, end: x.end_time });
  }

  return places.map((p) => ({
    lat: p.lat,
    lng: p.lng,
    address: p.address,
    short: p.short,
    count: p.merchants.size,
    merchants: [...p.merchants.values()],
  }));
}

module.exports = { groupByPlace, MERGE_KM };
