// Géocodage via Nominatim (OpenStreetMap) : 1 requête/seconde max, avec cache mémoire.
const cache = new Map();
let chain = Promise.resolve();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// "12 Place de la Victoire, Bordeaux" à partir des détails d'adresse Nominatim
function shortLabel(r) {
  const a = r.address || {};
  const road = a.road || a.pedestrian || a.square || a.footway || a.path || a.cycleway || a.residential || a.neighbourhood || '';
  const city = a.city || a.town || a.village || a.municipality || a.hamlet || '';
  const s = [[a.house_number, road].filter(Boolean).join(' '), city].filter(Boolean).join(', ');
  return s || String(r.display_name || '').split(',').slice(0, 2).map((x) => x.trim()).join(', ');
}

async function query(q) {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', '5');
  url.searchParams.set('accept-language', 'fr');
  const countries = process.env.GEOCODE_COUNTRIES || 'fr';
  if (countries !== 'all') url.searchParams.set('countrycodes', countries);
  url.searchParams.set('q', q);

  const res = await fetch(url, {
    headers: {
      'User-Agent': process.env.GEOCODE_USER_AGENT || 'trouverunmarchand.com/1.0 (contact via site)',
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error('Géocodage indisponible');
  const rows = await res.json();
  return rows.map((r) => ({
    label: r.display_name,
    short: shortLabel(r),
    lat: Number(r.lat),
    lng: Number(r.lon),
    hasNumber: Boolean(r.address && r.address.house_number),
  }));
}

function geocode(q) {
  const key = q.trim().toLowerCase();
  if (cache.has(key)) return Promise.resolve(cache.get(key));
  const p = chain.then(async () => {
    try {
      const out = await query(q);
      if (cache.size > 500) cache.clear();
      cache.set(key, out);
      return out;
    } finally {
      await sleep(1100);
    }
  });
  chain = p.catch(() => {});
  return p;
}

module.exports = { geocode };
