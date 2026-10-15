// Crée (ou supprime avec --remove) 30 marchands fictifs sur la région bordelaise.
//   npm run seed:demo
//   npm run seed:demo:remove
require('./env').load();
const bcrypt = require('bcryptjs');
const { db } = require('./db');
const { seedDemo, removeDemo, DOMAIN, PASSWORD } = require('./demo-data');

if (process.argv.includes('--remove')) {
  console.log(`${removeDemo(db)} marchand(s) de démonstration supprimé(s).`);
} else {
  const r = seedDemo(db, bcrypt.hashSync(PASSWORD, 10));
  console.log(`✅ ${r.merchants} marchands fictifs et ${r.sessions} sessions créés (région bordelaise).`);
  console.log(`   Connexion possible avec demo01@${DOMAIN} … demo30@${DOMAIN} / ${PASSWORD}`);
}
