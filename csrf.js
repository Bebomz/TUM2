// Protection CSRF par jeton de session (synchronizer token).
const crypto = require('crypto');

// Crée le jeton dans la session s'il n'existe pas encore, et le renvoie.
function ensureToken(session) {
  if (!session.csrf) session.csrf = crypto.randomBytes(24).toString('hex');
  return session.csrf;
}

// Compare en temps constant le jeton reçu à celui de la session.
function isValid(session, token) {
  if (!session || typeof session.csrf !== 'string' || typeof token !== 'string') return false;
  const a = Buffer.from(session.csrf);
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { ensureToken, isValid };
