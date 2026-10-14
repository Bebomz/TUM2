const DAYS = ['', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

function slugify(s) {
  return (
    String(s)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'marchand'
  );
}

// Distance en km entre deux points GPS
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const t = (x) => (x * Math.PI) / 180;
  const dLat = t(lat2 - lat1);
  const dLng = t(lng2 - lng1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(t(lat1)) * Math.cos(t(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

module.exports = { DAYS, slugify, haversine, TIME_RE, EMAIL_RE, COLOR_RE };
