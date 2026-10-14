const { db } = require('./db');
const makeManage = require('./route-manage');

module.exports = makeManage({
  admin: false,
  resolve: (req) => db.prepare('SELECT * FROM merchants WHERE user_id = ?').get(req.user.id),
});
