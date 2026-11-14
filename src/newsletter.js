'use strict';
/**
 * Newsletter / contact : inscription (prénom, nom, téléphone, e-mail), désinscription en un clic,
 * e-mail de notification envoyé au propriétaire (CONTACT_EMAIL ou config newsletter.emailDestination,
 * via le SMTP Brevo — l'inscrit ne reçoit rien), et synchronisation facultative avec une liste de contacts Brevo
 * (variables BREVO_API_KEY et BREVO_LIST_ID).
 *
 * Les données restent dans la base (table « abonnes ») ; l'admin peut les exporter en CSV.
 */
const crypto = require('crypto');
const { ErreurClient } = require('./commandes');

const RE_EMAIL = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;
const RE_TEL = /^\+?[0-9 ().-]{6,20}$/;
const nettoyer = (v, max) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);

function creerServiceNewsletter({ db, config: getConfig, mailer, cle, siteUrl = '', journal = console }) {
  const jeton = (email) => crypto.createHmac('sha256', cle).update(`desinscription:${email}`).digest('hex').slice(0, 32);
  const lienDesinscription = (email) => `${siteUrl.replace(/\/$/, '')}/newsletter/unsubscribe?e=${encodeURIComponent(email)}&t=${jeton(email)}`;

  async function synchroBrevo(a) {
    const cleApi = process.env.BREVO_API_KEY; const liste = Number(process.env.BREVO_LIST_ID);
    if (!cleApi || !liste) return;
    const attributs = { FIRSTNAME: a.prenom, LASTNAME: a.nom };
    if (a.telephone && a.telephone.startsWith('+')) attributs.SMS = a.telephone.replace(/[^\d+]/g, '');
    try {
      const r = await fetch(`${(process.env.BREVO_API_BASE || 'https://api.brevo.com/v3').replace(/\/$/, '')}/contacts`, {
        method: 'POST',
        headers: { 'api-key': cleApi, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ email: a.email, attributes: attributs, listIds: [liste], updateEnabled: true }),
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok && r.status !== 204) console.error(`[newsletter] Brevo a refusé le contact (${r.status}) : ${(await r.text()).slice(0, 200)}`);
    } catch (e) { journal.warn(`[newsletter] Brevo injoignable : ${e.message}`); }
  }

  /** Adresse qui reçoit chaque inscription (CONTACT_EMAIL, sinon la config). */
  function destination(config) {
    const nl = (config.experience && config.experience.newsletter) || {};
    return String(process.env.CONTACT_EMAIL || nl.emailDestination || '').trim();
  }

  /** E-mail envoyé AU PROPRIÉTAIRE de la boutique (jamais à l'inscrit). Répondre = écrire à l'inscrit. */
  function emailNotification(config, a, { source, nouveau }) {
    const e = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const quand = new Date().toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' });
    const lignes = [
      ['Prénom', a.prenom], ['Nom', a.nom], ['E-mail', a.email],
      ['Téléphone', a.telephone || '—'], ['Origine', source], ['Date', quand],
      ['Statut', nouveau ? 'Nouvelle inscription' : 'Coordonnées mises à jour (déjà inscrit)'],
    ];
    const sujet = `${nouveau ? 'Nouvelle inscription' : 'Inscription mise à jour'} : ${a.prenom} ${a.nom}`;
    const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"></head>
<body style="margin:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#1d2733">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" style="max-width:560px;background:#fff;border:1px solid #dde3ea;border-radius:12px" cellpadding="0" cellspacing="0">
<tr><td style="padding:22px 24px 6px"><div style="font-size:12px;letter-spacing:.18em;color:#0a8fb0;text-transform:uppercase">${e(config.site.nom)} · formulaire du site</div>
<h1 style="margin:8px 0 0;font-size:20px">${e(sujet)}</h1></td></tr>
<tr><td style="padding:12px 24px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">
${lignes.map(([k, v]) => `<tr><td style="padding:7px 0;color:#5b6876;width:120px;border-bottom:1px solid #eef1f4">${k}</td><td style="padding:7px 0;border-bottom:1px solid #eef1f4"><b>${e(v)}</b></td></tr>`).join('\n')}
</table>
<p style="margin:16px 0 0;font-size:13px;color:#5b6876">Clique sur « Répondre » pour écrire directement à cette personne. La liste complète est dans l’admin : /admin/newsletter (export CSV).</p></td></tr>
</table></td></tr></table></body></html>`;
    const text = `${sujet}\n\n${lignes.map(([k, v]) => `${k} : ${v}`).join('\n')}\n\nRépondre à cet e-mail = écrire à ${a.email}.\n`;
    return { sujet, html, text };
  }

  return {
    /** Inscrit (ou met à jour) un abonné. Renvoie { nouveau } */
    async inscrire(donnees, { source = 'site' } = {}) {
      const config = getConfig();
      const nl = (config.experience && config.experience.newsletter) || {};
      if (donnees.site) return { nouveau: false, ignore: true }; // champ piège rempli par un robot
      const a = {
        prenom: nettoyer(donnees.prenom, 60),
        nom: nettoyer(donnees.nom, 60),
        telephone: nettoyer(donnees.telephone, 20),
        email: nettoyer(donnees.email, 254).toLowerCase(),
      };
      if (!a.prenom) throw new ErreurClient('Enter your first name.');
      if (!a.nom) throw new ErreurClient('Enter your last name.');
      if (!RE_EMAIL.test(a.email)) throw new ErreurClient('Check your email address: it should look like name@example.com.');
      if (nl.telephoneObligatoire && !a.telephone) throw new ErreurClient('Enter your phone number.');
      if (a.telephone && !RE_TEL.test(a.telephone)) throw new ErreurClient('Check your phone number (digits, spaces and + only).');
      if (donnees.consentement !== true) throw new ErreurClient('Tick the box to agree to receive our emails.');

      const existant = db.prepare('SELECT id, desinscrit_le FROM abonnes WHERE email = ?').get(a.email);
      if (existant) {
        db.prepare("UPDATE abonnes SET prenom = ?, nom = ?, telephone = ?, consentement_le = datetime('now'), desinscrit_le = NULL, source = ? WHERE id = ?")
          .run(a.prenom, a.nom, a.telephone || null, source, existant.id);
      } else {
        db.prepare("INSERT INTO abonnes (email, prenom, nom, telephone, source, consentement_le) VALUES (?, ?, ?, ?, ?, datetime('now'))")
          .run(a.email, a.prenom, a.nom, a.telephone || null, source);
      }
      const nouveau = !existant || Boolean(existant.desinscrit_le);
      // Notification au propriétaire + Brevo en arrière-plan : l'inscription ne dépend pas de leur réussite.
      // AUCUN e-mail n'est envoyé à l'inscrit (le client ne reçoit qu'un e-mail : sa livraison après paiement).
      const dest = destination(config);
      if (dest) {
        const { sujet, html, text } = emailNotification(config, a, { source, nouveau });
        journal.log(`[formulaire] inscription reçue (${source}) → notification vers ${dest}`);
        Promise.resolve(mailer.envoyerMessage({ to: dest, replyTo: a.email, subject: sujet, html, text }))
          .catch((e) => console.error(`[formulaire] ✗ notification NON envoyée à ${dest} : ${e.message}`));
      } else console.error('[formulaire] ✗ aucune adresse de destination : renseigne CONTACT_EMAIL.');
      synchroBrevo(a);
      return { nouveau, prenom: a.prenom };
    },

    desinscrire(email, t) {
      const e = String(email || '').trim().toLowerCase();
      const attendu = jeton(e);
      if (!t || t.length !== attendu.length || !crypto.timingSafeEqual(Buffer.from(String(t)), Buffer.from(attendu))) return false;
      db.prepare("UPDATE abonnes SET desinscrit_le = datetime('now') WHERE email = ? AND desinscrit_le IS NULL").run(e);
      return true;
    },

    liste(limite = 500) {
      return db.prepare('SELECT * FROM abonnes ORDER BY cree_le DESC LIMIT ?').all(limite);
    },
    compte() {
      return db.prepare('SELECT COUNT(*) AS n FROM abonnes WHERE desinscrit_le IS NULL').get().n;
    },
    csv() {
      const cel = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const rows = db.prepare('SELECT prenom, nom, email, telephone, consentement_le, source, cree_le, desinscrit_le FROM abonnes ORDER BY cree_le').all();
      return ['first_name,last_name,email,phone,consent_date,source,signed_up,unsubscribed']
        .concat(rows.map((r) => [r.prenom, r.nom, r.email, r.telephone, r.consentement_le, r.source, r.cree_le, r.desinscrit_le].map(cel).join(',')))
        .join('\r\n');
    },
    lienDesinscription,
    destination: () => destination(getConfig()),
  };
}

module.exports = { creerServiceNewsletter };
