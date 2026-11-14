'use strict';
/**
 * Envoi des e-mails (livraison des codes, notification du formulaire, alertes).
 *
 * DEUX MODES, choisis automatiquement :
 *  1. API HTTP de Brevo (recommandé, OBLIGATOIRE sur Render gratuit qui bloque les ports SMTP 25/465/587)
 *     → variable BREVO_API_KEY (clé « API » qui commence par xkeysib-…, PAS la clé SMTP xsmtpsib-…).
 *     Requête : POST https://api.brevo.com/v3/smtp/email, en-tête « api-key ».
 *  2. SMTP Brevo (Nodemailer) si BREVO_API_KEY est absente : SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS.
 *
 * Expéditeur : MAIL_FROM (« Nom <adresse> » ou « adresse ») = adresse VALIDÉE dans Brevo
 * (Expéditeurs, domaines et IP dédiées → Expéditeurs) ou adresse d'un domaine authentifié dans Brevo.
 * Au démarrage, le serveur vérifie auprès de Brevo que cet expéditeur est autorisé et le dit dans les journaux.
 */
const nodemailer = require('nodemailer');
const { formatEuros } = require('./catalogue');

const BREVO_API = () => (process.env.BREVO_API_BASE || 'https://api.brevo.com/v3').replace(/\/$/, '');

/** « Gift Cards <contact@x.fr> » → { name: 'Gift Cards', email: 'contact@x.fr' } */
function analyserAdresse(v) {
  const s = String(v || '').trim();
  const m = s.match(/^\s*"?([^"<]*?)"?\s*<\s*([^>\s]+@[^>\s]+)\s*>\s*$/);
  if (m) return { name: m[1].trim() || undefined, email: m[2].toLowerCase() };
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? { email: s.toLowerCase() } : null;
}
const domaine = (email) => String(email || '').split('@')[1] || '';
const GRATUITS = /^(gmail|googlemail|yahoo|ymail|hotmail|outlook|live|msn|icloud|me|aol|gmx|laposte|orange|free|sfr)\./i;

/** Erreur d'envoi lisible dans les journaux de Render. */
class ErreurEmail extends Error {
  constructor(message, details = {}) { super(message); this.name = 'ErreurEmail'; Object.assign(this, details); }
}

/** Explique en français la réponse d'erreur de Brevo. */
function expliquerBrevo(status, corps) {
  const msg = String((corps && (corps.message || corps.code)) || '').slice(0, 300);
  if (status === 401 && /unrecogni[sz]ed IP|IP address/i.test(msg)) {
    return `Brevo bloque l'adresse IP de ton serveur (${msg}). Va dans Brevo → Paramètres → Sécurité → IP autorisées et DÉSACTIVE le blocage des IP inconnues (les IP de Render changent).`;
  }
  if (status === 401) return `Clé API Brevo refusée (${msg || 'non autorisée'}). Crée une clé dans Brevo → SMTP & API → onglet « Clés API » (elle commence par xkeysib-) et colle-la dans BREVO_API_KEY.`;
  if (status === 400 && /sender/i.test(msg)) return `Expéditeur refusé par Brevo (${msg}). L'adresse de MAIL_FROM doit être validée dans Brevo → Expéditeurs.`;
  if (status === 403) return `Compte Brevo non autorisé à envoyer (${msg}). Vérifie que ton compte est activé pour les e-mails transactionnels (Brevo → Transactionnel) et qu'il n'est pas suspendu.`;
  if (status === 402) return `Crédits d'envoi Brevo épuisés (${msg}).`;
  if (status === 429) return `Trop d'envois en peu de temps (limite Brevo atteinte) : ${msg}`;
  return `Brevo a répondu ${status} : ${msg || 'erreur inconnue'}`;
}

/** Transport « API HTTP Brevo » avec la même interface que Nodemailer (sendMail / verify). */
function creerTransportBrevo({ cle, journal = console }) {
  const entetes = { 'api-key': cle, 'content-type': 'application/json', accept: 'application/json' };
  async function appel(chemin, options = {}) {
    let r;
    try {
      r = await fetch(`${BREVO_API()}${chemin}`, { ...options, headers: entetes, signal: AbortSignal.timeout(15_000) });
    } catch (e) {
      throw new ErreurEmail(`Brevo injoignable (${e.name === 'TimeoutError' ? 'délai dépassé' : e.message}).`);
    }
    const texte = await r.text();
    let corps = {}; try { corps = texte ? JSON.parse(texte) : {}; } catch { corps = { message: texte.slice(0, 200) }; }
    if (!r.ok) throw new ErreurEmail(expliquerBrevo(r.status, corps), { status: r.status, brevo: corps });
    return corps;
  }
  return {
    mode: 'api',
    appel,
    async sendMail({ from, to, replyTo, subject, html, text }) {
      const sender = analyserAdresse(from);
      if (!sender) throw new ErreurEmail(`MAIL_FROM manquant ou invalide (« ${from || ''} »). Exemple : MAIL_FROM=Gift Cards <ton-adresse@exemple.com>`);
      const dest = analyserAdresse(to);
      if (!dest) throw new ErreurEmail(`Adresse du destinataire invalide (« ${to || ''} »).`);
      const corps = { sender, to: [dest], subject: String(subject || '(sans objet)') };
      const rep = analyserAdresse(replyTo);
      if (rep) corps.replyTo = rep;
      if (html) corps.htmlContent = html;
      if (text) corps.textContent = text;
      if (!html && text) corps.htmlContent = `<pre style="font-family:inherit;white-space:pre-wrap">${esc(text)}</pre>`;
      const res = await appel('/smtp/email', { method: 'POST', body: JSON.stringify(corps) });
      journal.log(`[e-mail] ✓ accepté par Brevo (API) → ${dest.email} · « ${corps.subject} » · messageId ${res.messageId || '?'}`);
      return { messageId: res.messageId, accepted: [dest.email] };
    },
    async verify() { await appel('/account'); return true; },
  };
}

function creerTransportSmtp() {
  const port = Number(process.env.SMTP_PORT || 587);
  const t = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
    port,
    secure: port === 465, // 465 = TLS direct ; 587 = STARTTLS
    requireTLS: port !== 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 15_000,
  });
  t.mode = 'smtp';
  return t;
}

/** API HTTP si BREVO_API_KEY est renseignée, sinon SMTP. */
function creerTransport(journal) {
  return process.env.BREVO_API_KEY ? creerTransportBrevo({ cle: process.env.BREVO_API_KEY, journal }) : creerTransportSmtp();
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = (cents) => formatEuros(cents / 100);

function dateFr(iso) {
  const d = iso ? new Date(iso.replace(' ', 'T') + (iso.endsWith('Z') ? '' : 'Z')) : new Date();
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris', timeZoneName: 'short' });
}

/**
 * Construit le contenu de l'e-mail (section B).
 * @param commande  ligne de la table commandes (lignes en JSON)
 * @param codes     [{produit, code}] codes VENDUS pour cette commande
 */
function construireEmail(config, commande, codes) {
  const lignes = JSON.parse(commande.lignes);
  const t = config.textes;
  const sc = config.site.serviceClient;
  const contact = [sc.email, sc.telephone, sc.horaires].filter(Boolean).join(' · ') || '(contact details coming soon)';
  const pays = config.site.zoneValidite || config.site.paysValidite.join(', ');
  const restants = codes.slice();

  const blocs = [];
  const textes = [];
  for (const l of lignes) {
    const p = config.produits[l.produit];
    for (let i = 0; i < l.quantite; i++) {
      // Carte à montant libre : le code doit être celui de LA BONNE VALEUR (ex. Steam 20 € et Steam 50 €
      // dans la même commande), sinon les montants affichés seraient inversés.
      let idx = p.type === 'carte' ? restants.findIndex((c) => c.produit === l.produit && c.valeurCents === l.valeurCents) : -1;
      if (idx < 0) idx = restants.findIndex((c) => c.produit === l.produit && (p.type !== 'carte' || c.valeurCents == null));
      const code = idx >= 0 ? restants.splice(idx, 1)[0].code : '—';
      const valeur = p.type === 'carte' ? eur(l.valeurCents) : l.libelleValeur;
      const inclus = p.type === 'pack'
        ? p.contenu.map((c) => {
          const n = config.produits[c.produit].nom;
          return { nom: n, montant: c.montant ? formatEuros(c.montant) : c.libelle || '' };
        })
        : null;

      blocs.push(`
        <table role="presentation" width="100%" style="border:1px solid #E6E1D6;border-radius:12px;margin:0 0 16px;border-collapse:separate">
          <tr><td style="padding:18px 20px">
            <div style="font-size:18px;font-weight:700;color:#1B2A41">${esc(p.nom)}</div>
            <div style="font-size:14px;color:#5B6472;margin-top:4px">Card value: <b>${esc(valeur)}</b> · Price paid: <b>${eur(l.prixCents)}</b>${l.remise ? ` <span style="color:#C81E2B;font-weight:700">(−${l.remise}%)</span>` : ''}</div>
            ${inclus ? `<div style="font-size:14px;color:#1B2A41;margin-top:10px">Cards included in the pack:</div>
              <ul style="margin:6px 0 0 18px;padding:0;font-size:14px;color:#1B2A41">${inclus.map((x) => `<li>${esc(x.nom)}${x.montant && !x.nom.includes(x.montant) ? ' — ' + esc(x.montant) : ''}</li>`).join('')}</ul>` : ''}
            <div style="margin-top:14px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#8A6D1F">${inclus ? 'Pack code' : `${esc(p.nom)} code`}</div>
            <div style="margin-top:6px;font-family:Menlo,Consolas,monospace;font-size:20px;letter-spacing:.06em;background:#F7F5F0;border:1px dashed #C9A24B;border-radius:8px;padding:12px 14px;color:#1B2A41;word-break:break-all">${esc(code)}</div>
          </td></tr>
        </table>`);
      textes.push(
        `${p.nom}\nCard value: ${valeur}\nPrice paid: ${eur(l.prixCents)}${l.remise ? ` (−${l.remise}%)` : ''}\n` +
        (inclus ? `Cards included: ${inclus.map((x) => `${x.nom}${x.montant && !x.nom.includes(x.montant) ? ' ' + x.montant : ''}`).join(', ')}\nPack code: ${code}\n` : `Code: ${code}\n`)
      );
    }
  }

  const sujet = t.emailObjet.replace('{numero}', commande.numero);
  const date = dateFr(commande.payee_le || commande.cree_le);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(sujet)}</title></head>
<body style="margin:0;background:#F7F5F0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1B2A41">
<table role="presentation" width="100%" style="background:#F7F5F0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" style="max-width:560px;background:#FFFFFF;border-radius:16px;border-collapse:separate">
  <tr><td style="background:#1B2A41;border-radius:16px 16px 0 0;padding:22px 24px;color:#FFFFFF">
    <div style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#C9A24B">${esc(config.site.nom)}</div>
    <div style="font-size:22px;font-weight:700;margin-top:6px">${esc(t.emailRemerciement)}</div>
  </td></tr>
  <tr><td style="padding:22px 24px 6px">
    <table role="presentation" width="100%" style="font-size:14px;color:#1B2A41">
      <tr><td style="padding:3px 0;color:#5B6472">Order</td><td align="right"><b>${esc(commande.numero)}</b></td></tr>
      <tr><td style="padding:3px 0;color:#5B6472">Purchase date</td><td align="right">${esc(date)}</td></tr>
      <tr><td style="padding:3px 0;color:#5B6472">Payment status</td><td align="right"><b style="color:#1E7A46">Confirmed</b></td></tr>
      <tr><td style="padding:3px 0;color:#5B6472">Amount paid</td><td align="right"><b>${eur(commande.total_cents)}</b></td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:12px 24px 0">${blocs.join('')}</td></tr>
  <tr><td style="padding:4px 24px 0;font-size:14px;line-height:1.55">
    <p style="margin:0 0 10px"><b>Where your code works:</b> ${esc(pays)}.</p>
    <p style="margin:0 0 10px"><b>How to use your code:</b> ${esc(t.instructionsGenerales)}</p>
    <p style="margin:0 0 10px;color:#5B6472;font-size:13px">${esc(t.conditionsUtilisation)}</p>
    <p style="margin:0 0 10px"><b>Customer service:</b> ${esc(contact)}</p>
    <p style="margin:0 0 18px;color:#1E7A46"><b>Payment confirmation:</b> your payment of ${eur(commande.total_cents)} has been confirmed by PayPal${commande.paypal_capture_id ? ` (ref. ${esc(commande.paypal_capture_id)})` : ''}.</p>
  </td></tr>
  <tr><td style="padding:16px 24px 24px;border-top:1px solid #EEE9DF;font-size:12px;color:#8A919C">
    Keep this email: it contains your code. Don't share it with anyone. You are receiving this message only because you placed this order.
  </td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    t.emailRemerciement, '',
    `Order: ${commande.numero}`, `Purchase date: ${date}`, 'Payment status: Confirmed',
    `Amount paid: ${eur(commande.total_cents)}`, '',
    ...textes, '',
    `Where your code works: ${pays}.`,
    `How to use your code: ${t.instructionsGenerales}`,
    t.conditionsUtilisation,
    `Customer service: ${contact}`,
    `Payment confirmation: your payment of ${eur(commande.total_cents)} has been confirmed by PayPal.`,
  ].join('\n');

  return { sujet, html, text };
}

function creerMailer({ transport, journal = console } = {}) {
  const tr = transport || creerTransport(journal);
  const mode = tr.mode || 'smtp';
  // Expéditeur de secours : un expéditeur actif du compte Brevo, si MAIL_FROM n'est pas autorisé (rempli par verifier()).
  let expediteurSecours = null;
  const expediteur = () => expediteurSecours || process.env.MAIL_FROM;

  /** Envoi commun : try/catch + journal clair (jamais le contenu, donc jamais un code). */
  async function envoyer(type, message) {
    const m = { ...message, from: expediteur() };
    try {
      const r = await tr.sendMail(m);
      if (mode === 'smtp') journal.log(`[e-mail] ✓ ${type} envoyé (SMTP) → ${m.to}`);
      return r;
    } catch (e) {
      const conseilSmtp = mode === 'smtp' && /timeout|ETIMEDOUT|ECONNREFUSED|ENETUNREACH|Greeting/i.test(e.message)
        ? ' → Les ports SMTP sont probablement bloqués par l’hébergeur (Render gratuit les bloque). Renseigne BREVO_API_KEY pour envoyer par l’API HTTP de Brevo.'
        : '';
      console.error(`[e-mail] ✗ ÉCHEC ${type} → ${m.to} (${mode === 'api' ? 'API Brevo' : 'SMTP'}) : ${e.message}${conseilSmtp}`);
      throw e;
    }
  }

  return {
    mode,
    async envoyerLivraison(config, commande, codes) {
      const { sujet, html, text } = construireEmail(config, commande, codes);
      // « Répondre » : l'e-mail du service client, sinon (adresse d'exemple non remplacée) CONTACT_EMAIL
      const sc = config.site.serviceClient.email || '';
      const replyTo = (sc && !/your-domain|ton-domaine|example|exemple/i.test(sc) ? sc : process.env.CONTACT_EMAIL || config.experience?.newsletter?.emailDestination) || undefined;
      return envoyer(`livraison commande ${commande.numero}`, { to: commande.email, replyTo, subject: sujet, html, text });
    },
    /** Message libre (ex. notification d'inscription au propriétaire ; replyTo = l'inscrit). */
    envoyerMessage({ to, replyTo, subject, html, text }) {
      return envoyer('notification formulaire', { to, replyTo: replyTo || undefined, subject, html, text });
    },
    async envoyerAlerte(sujet, texte) {
      if (!process.env.ADMIN_EMAIL) return null;
      return envoyer('alerte', { to: process.env.ADMIN_EMAIL, subject: `[Boutique] ${sujet}`, text: texte });
    },
    /** Vérifie la configuration auprès de Brevo et renvoie un message clair (affiché au démarrage et dans /admin/diagnostic). */
    async verifier() {
      const from = analyserAdresse(process.env.MAIL_FROM);
      if (mode === 'api') {
        const cle = process.env.BREVO_API_KEY;
        if (/^xsmtpsib-/.test(cle)) return { ok: false, message: 'BREVO_API_KEY contient une clé SMTP (xsmtpsib-…). Il faut une clé API (xkeysib-…) : Brevo → SMTP & API → onglet « Clés API ».' };
        let compte;
        try { compte = await tr.appel('/account'); } catch (e) { return { ok: false, message: e.message }; }
        // Expéditeurs autorisés : adresses validées + domaines authentifiés
        let senders = []; let domaines = [];
        try { senders = ((await tr.appel('/senders')).senders || []).filter((x) => x.active !== false); } catch (e) { journal.warn(`[e-mail] liste des expéditeurs Brevo illisible : ${e.message}`); }
        try { domaines = ((await tr.appel('/senders/domains')).domains || []).filter((d) => d.authenticated).map((d) => String(d.domain_name || d.domain || '').toLowerCase()); } catch { /* facultatif */ }
        const liste = senders.map((x) => x.email).join(', ') || 'aucun';
        const autorise = from && (senders.some((x) => String(x.email).toLowerCase() === from.email) || domaines.includes(domaine(from.email)));
        const qui = `compte Brevo ${compte.email || ''}`.trim();
        if (!from) {
          if (senders[0]) { expediteurSecours = senders[0].name ? `${senders[0].name} <${senders[0].email}>` : senders[0].email; return { ok: true, avertissement: true, message: `API Brevo OK (${qui}). MAIL_FROM est vide : j'utilise l'expéditeur validé ${senders[0].email}. Renseigne MAIL_FROM pour choisir.` }; }
          return { ok: false, message: `API Brevo OK (${qui}) mais MAIL_FROM est vide et aucun expéditeur n'est validé dans Brevo (Expéditeurs → Ajouter).` };
        }
        if (!autorise) {
          if (senders[0]) {
            expediteurSecours = senders[0].name ? `${senders[0].name} <${senders[0].email}>` : senders[0].email;
            return { ok: true, avertissement: true, message: `API Brevo OK (${qui}), MAIS l'expéditeur ${from.email} n'est PAS validé dans Brevo. J'envoie en attendant avec ${senders[0].email}. Expéditeurs validés : ${liste}.` };
          }
          return { ok: false, message: `API Brevo OK (${qui}), mais l'expéditeur ${from.email} n'est pas validé et aucun expéditeur ne l'est. Brevo → Expéditeurs, domaines et IP dédiées → Expéditeurs → Ajouter ${from.email}, puis clique le lien reçu.` };
        }
        if (GRATUITS.test(domaine(from.email))) {
          // Cause n°1 des e-mails « envoyés mais jamais reçus » : expéditeur en @gmail.com, @yahoo… envoyé par Brevo.
          // Brevo ACCEPTE l'e-mail, mais la boîte du destinataire le rejette ou le met en spam (règles anti-usurpation DMARC).
          const meme = [process.env.ADMIN_EMAIL, process.env.CONTACT_EMAIL].some((a) => String(a || '').toLowerCase() === from.email);
          return { ok: true, avertissement: true, message: `API Brevo OK (${qui}) · expéditeur ${from.email} autorisé, MAIS c'est une adresse ${domaine(from.email)} : Brevo accepte l'envoi, puis la boîte du destinataire le classe souvent en SPAM ou le refuse (anti-usurpation). ${meme ? "Tu t'écris en plus à toi-même : Gmail masque ces messages. Teste avec une AUTRE adresse et regarde le dossier Spam. " : ''}Solution durable : une adresse sur ton propre domaine, authentifié dans Brevo (Expéditeurs, domaines et IP dédiées → Domaines). Pour voir ce que devient chaque e-mail : Brevo → Transactionnel → Journaux.` };
        }
        return { ok: true, message: `API Brevo OK (${qui}) · expéditeur ${from.email} autorisé.` };
      }
      if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return { ok: false, message: 'Aucun moyen d’envoi : renseigne BREVO_API_KEY (API HTTP, recommandé) ou SMTP_USER + SMTP_PASS.' };
      if (!from) return { ok: false, message: 'MAIL_FROM manquant (adresse d’expéditeur validée dans Brevo).' };
      try { await tr.verify(); return { ok: true, message: `Connexion SMTP à ${process.env.SMTP_HOST || 'smtp-relay.brevo.com'} réussie.` }; }
      catch (e) { return { ok: false, message: `Connexion SMTP refusée : ${e.message}${process.env.RENDER ? ' → Render gratuit bloque les ports SMTP : renseigne BREVO_API_KEY.' : ''}` }; }
    },
    envoyerTest(destinataire) {
      return envoyer('e-mail de test', {
        to: destinataire,
        subject: 'Test email — gift card store',
        text: `If you can read this, emails are being sent correctly (Brevo ${mode === 'api' ? 'HTTP API' : 'SMTP'}).`,
      });
    },
  };
}

module.exports = { creerMailer, construireEmail, analyserAdresse, creerTransportBrevo, expliquerBrevo };
