// Chargeur minimal de fichier .env (sans dépendance).
// Format : CLE=valeur, une par ligne. Les commentaires (#) doivent être sur leur propre ligne.
// Les variables déjà définies dans l'environnement (ex. sur Render) ne sont jamais écrasées.
const fs = require('fs');
const path = require('path');

function parse(text) {
  const out = {};
  for (const line of String(text).split(/\r?\n/)) {
    if (line.trim().startsWith('#')) continue;
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"') && v.length >= 2) || (v.startsWith("'") && v.endsWith("'") && v.length >= 2)) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

function load(file = path.join(__dirname, '.env')) {
  if (!fs.existsSync(file)) return;
  const vars = parse(fs.readFileSync(file, 'utf8'));
  for (const [k, v] of Object.entries(vars)) {
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

module.exports = { parse, load };
