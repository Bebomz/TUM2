// Signalement d'absence : un client indique qu'il n'a pas trouvé un marchand à son emplacement.
// Le marchand est prévenu par e-mail (toujours) et par WhatsApp (si configuré et accepté par lui),
// et l'administrateur par e-mail. Tout est testable : base, envoi de mail et fetch sont injectés.
const { DAYS } = require('./util');

const DUPLICATE_HOURS = 6; // même client (IP) + même session : un seul signalement
const MERCHANT_THROTTLE_HOURS = 4; // le marchand n'est pas ré-alerté pour une même session plus souvent

// Jour (1 = lundi … 7 = dimanche) et heure "HH:MM" dans le fuseau du site.
function localNow(date = new Date(), tz = 'Europe/Paris') {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t).value;
  return { weekday: { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[get('weekday')], time: `${get('hour')}:${get('minute')}` };
}

// On ne peut signaler qu'une session en cours (bon jour, entre l'heure de début et de fin).
function isReportable(session, now) {
  return session.weekday === now.weekday && session.start_time <= now.time && now.time <= session.end_time;
}

// Numéro au format international sans "+" (attendu par WhatsApp) ; null si invalide.
function normalizePhone(raw, cc = '33') {
  let s = String(raw || '').trim();
  if (!s) return null;
  const international = s.startsWith('+');
  s = s.replace(/\D/g, '');
  if (!international) {
    if (s.startsWith('00')) s = s.slice(2); // 0033…
    else if (s.startsWith('0')) s = cc + s.slice(1); // 06… -> 336…
    else return null; // ambigu : ni "+" ni "0"
  }
  if (s.startsWith(cc + '0')) s = cc + s.slice(cc.length + 1); // +33 (0)6…
  if (s.startsWith('33') && s.length !== 11) return null;
  return s.length >= 8 && s.length <= 15 ? s : null;
}

// Paramètre de modèle WhatsApp : pas de saut de ligne, tabulation ni longues séries d'espaces.
const waParam = (s) => String(s || '').replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim().slice(0, 150) || '-';

function buildMessages({ merchant, session, comment, baseUrl }) {
  const where = session.short_address || session.address;
  const when = `${DAYS[session.weekday]} ${session.start_time}–${session.end_time}`;
  const note = comment ? `\nCommentaire du client : « ${comment} »\n` : '';
  return {
    merchantEmail: {
      subject: `Un client ne vous a pas trouvé — ${where}`,
      text:
        `Bonjour,\n\nUn client indique ne pas vous avoir trouvé à votre emplacement :\n` +
        `  ${where}\n  ${when}\n${note}\n` +
        `Si vous êtes absent(e) (vacances, maladie…), suspendez vos sessions depuis votre espace marchand pour ne plus apparaître sur la carte :\n` +
        `${baseUrl}/espace\n\nL'équipe Trouver un marchand`,
    },
    whatsappParams: [waParam(merchant.business_name), waParam(`${where} – ${when}`)],
    adminEmail: {
      subject: `[Signalement] ${merchant.business_name} — ${where}`,
      text:
        `Un client signale l'absence d'un marchand.\n\nMarchand : ${merchant.business_name}\nLieu : ${session.address}\nSession : ${when}\n` +
        `${comment ? `Commentaire : ${comment}\n` : ''}\nFiche : ${baseUrl}/admin/marchands/${merchant.id}\nTous les signalements : ${baseUrl}/admin/signalements\n`,
    },
  };
}

// WhatsApp Business Cloud API (Meta). Un message envoyé à l'initiative de l'entreprise doit utiliser
// un modèle (template) préalablement approuvé : voir README. Sans configuration : ignoré.
async function sendWhatsApp({ to, params, env = process.env, fetchImpl = fetch }) {
  if (!env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_ID) return { sent: false, skipped: 'non configuré' };
  const url = `https://graph.facebook.com/${env.WHATSAPP_API_VERSION || 'v21.0'}/${env.WHATSAPP_PHONE_ID}/messages`;
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: env.WHATSAPP_TEMPLATE || 'signalement_absence',
        language: { code: env.WHATSAPP_LANG || 'fr' },
        components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }],
      },
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return { sent: false, error: `WhatsApp HTTP ${res.status} ${body.slice(0, 200)}` };
  }
  return { sent: true };
}

const sqlDate = (d) => d.toISOString().slice(0, 19).replace('T', ' '); // même format que datetime('now')
const hoursAgo = (now, h) => new Date(now.getTime() - h * 3600 * 1000);

/**
 * Traite un signalement. Renvoie { status } parmi :
 *   'ok'             signalement enregistré (+ détail des notifications)
 *   'duplicate'      déjà signalé récemment par ce même client
 *   'not_found'      session inexistante ou suspendue
 *   'not_reportable' la session n'est pas en cours
 */
async function processReport({ db, sessionId, comment = '', ipHash, baseUrl, now = new Date(), env = process.env, sendMail, fetchImpl = fetch }) {
  const s = db
    .prepare(
      `SELECT s.*, m.id AS mid, m.business_name, m.email AS contact_email, m.phone, m.notify_whatsapp, u.email AS login_email
       FROM sessions s JOIN merchants m ON m.id = s.merchant_id LEFT JOIN users u ON u.id = m.user_id
       WHERE s.id = ? AND s.active = 1`
    )
    .get(sessionId);
  if (!s) return { status: 'not_found' };
  if (!isReportable(s, localNow(now, env.APP_TIMEZONE || 'Europe/Paris'))) return { status: 'not_reportable' };

  if (db.prepare('SELECT 1 FROM reports WHERE session_id = ? AND ip_hash = ? AND created_at > ?').get(s.id, ipHash, sqlDate(hoursAgo(now, DUPLICATE_HOURS)))) {
    return { status: 'duplicate' };
  }
  const alreadyAlerted = Boolean(
    db.prepare('SELECT 1 FROM reports WHERE session_id = ? AND merchant_emailed_at IS NOT NULL AND created_at > ?').get(s.id, sqlDate(hoursAgo(now, MERCHANT_THROTTLE_HOURS)))
  );

  const stamp = sqlDate(now);
  const id = Number(
    db
      .prepare(
        `INSERT INTO reports (session_id, merchant_id, address, weekday, start_time, end_time, comment, ip_hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(s.id, s.mid, s.address, s.weekday, s.start_time, s.end_time, comment, ipHash, stamp).lastInsertRowid
  );

  const msgs = buildMessages({ merchant: { id: s.mid, business_name: s.business_name }, session: s, comment, baseUrl });
  const errors = [];
  const done = { merchant_emailed_at: null, merchant_whatsapped_at: null, admin_emailed_at: null };
  const notified = { merchantEmail: false, whatsapp: false, admins: 0 };
  const attempt = async (label, fn) => {
    try {
      return await fn();
    } catch (e) {
      errors.push(`${label}: ${e.message}`);
      return null;
    }
  };

  if (!alreadyAlerted) {
    const to = s.login_email || s.contact_email;
    if (to) {
      await attempt('mail marchand', async () => {
        await sendMail({ to, ...msgs.merchantEmail });
        done.merchant_emailed_at = stamp;
        notified.merchantEmail = true;
      });
    }
    const phone = s.notify_whatsapp ? normalizePhone(s.phone) : null;
    if (phone) {
      await attempt('whatsapp', async () => {
        const r = await sendWhatsApp({ to: phone, params: msgs.whatsappParams, env, fetchImpl });
        if (r.sent) {
          done.merchant_whatsapped_at = stamp;
          notified.whatsapp = true;
        } else if (r.error) throw new Error(r.error);
      });
    }
  }

  const admins = env.REPORT_ADMIN_EMAIL
    ? env.REPORT_ADMIN_EMAIL.split(',').map((x) => x.trim()).filter(Boolean)
    : db.prepare("SELECT email FROM users WHERE role = 'admin'").all().map((r) => r.email);
  for (const to of admins) {
    await attempt(`mail admin ${to}`, async () => {
      await sendMail({ to, ...msgs.adminEmail });
      done.admin_emailed_at = stamp;
      notified.admins++;
    });
  }

  db.prepare('UPDATE reports SET merchant_emailed_at = ?, merchant_whatsapped_at = ?, admin_emailed_at = ?, notify_error = ? WHERE id = ?').run(
    done.merchant_emailed_at, done.merchant_whatsapped_at, done.admin_emailed_at, errors.length ? errors.join(' | ').slice(0, 500) : null, id
  );
  return { status: 'ok', id, notified, errors };
}

module.exports = { localNow, isReportable, normalizePhone, buildMessages, sendWhatsApp, processReport };
