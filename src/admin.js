'use strict';
/**
 * Espace protégé : table de stock (Produit, Valeur, Code, Statut, ID de transaction, Date de vente)
 * et suivi des commandes. Accès par identifiant + mot de passe (ADMIN_USER / ADMIN_PASSWORD).
 */
const crypto = require('crypto');
const stock = require('./stock');
const { formatEuros } = require('./catalogue');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const egal = (a, b) => {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
};

function routeurAdmin({ db, config: getConfig, commandes, newsletter, express, diagnostiquer, diagnostic, mailer, paypal }) {
  const r = express.Router();
  const USER = process.env.ADMIN_USER || '';
  const PASS = process.env.ADMIN_PASSWORD || '';
  const jetonCsrf = crypto.randomBytes(24).toString('hex');

  r.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Robots-Tag', 'noindex, nofollow');
    if (!USER || PASS.length < 12) {
      return res.status(503).send('Espace admin désactivé : renseigne ADMIN_USER et ADMIN_PASSWORD (12 caractères minimum).');
    }
    const [type, val] = String(req.headers.authorization || '').split(' ');
    if (type === 'Basic' && val) {
      const [u, ...p] = Buffer.from(val, 'base64').toString('utf8').split(':');
      if (egal(u, USER) && egal(p.join(':'), PASS)) {
        if (req.method === 'POST' && req.body?._csrf !== jetonCsrf) return res.status(403).send('Jeton de sécurité invalide. Recharge la page.');
        return next();
      }
    }
    res.set('WWW-Authenticate', 'Basic realm="Administration", charset="UTF-8"');
    return res.status(401).send('Accès protégé.');
  });

  const page = (titre, corps) => `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(titre)} — Admin</title><link rel="stylesheet" href="/css/admin.css"></head>
<body><header><b>Administration</b><nav><a href="/admin">Stock</a><a href="/admin/commandes">Commandes</a><a href="/admin/newsletter">Newsletter</a><a href="/admin/diagnostic">Diagnostic</a><a href="/">Voir la boutique</a></nav></header>
<main>${corps}</main></body></html>`;

  const csrf = `<input type="hidden" name="_csrf" value="${jetonCsrf}">`;
  const euros = (c) => (c === null || c === undefined ? '' : formatEuros(c / 100));
  const masque = (code) => code.length <= 4 ? '••••' : code.slice(0, 4) + '•'.repeat(Math.min(12, code.length - 4));

  r.get('/', (req, res) => {
    const config = getConfig();
    const filtre = { produit: config.produits[req.query.produit] ? req.query.produit : '', statut: ['disponible', 'reserve', 'vendu'].includes(req.query.statut) ? req.query.statut : '' };
    const lignes = stock.listerStock(db, filtre);
    const options = Object.entries(config.produits).map(([id, p]) => `<option value="${id}"${filtre.produit === id ? ' selected' : ''}>${esc(p.nom)}</option>`).join('');
    const message = req.query.msg ? `<p class="msg">${esc(req.query.msg)}</p>` : '';
    const resume = db.prepare(`SELECT produit, statut, COUNT(*) n, SUM(valeur_cents IS NULL) sansValeur FROM stock GROUP BY produit, statut`).all();
    const parProduit = {};
    for (const x of resume) {
      parProduit[x.produit] = parProduit[x.produit] || { disponible: 0, reserve: 0, vendu: 0, sansValeur: 0 };
      parProduit[x.produit][x.statut] = x.n;
      if (x.statut === 'disponible') parProduit[x.produit].sansValeur = x.sansValeur;
    }

    res.send(page('Stock', `
<h1>Table de stock</h1>${message}
<section class="carte"><h2>Résumé (commun aux 3 boutiques)</h2>
<table><thead><tr><th>Produit</th><th>Disponibles</th><th>dont sans valeur</th><th>Réservés</th><th>Vendus</th></tr></thead><tbody>
${Object.entries(config.produits).map(([id, p]) => { const s = parProduit[id] || {}; return `<tr><td>${esc(p.nom)}</td><td>${s.disponible || 0}</td><td class="${s.sansValeur ? 'alerte' : ''}">${s.sansValeur || 0}</td><td>${s.reserve || 0}</td><td>${s.vendu || 0}</td></tr>`; }).join('')}
</tbody></table>
<p class="aide">« Sans valeur » : pour une carte à montant libre, un code ne peut être vendu que si sa valeur est renseignée (il sera attribué à un achat du même montant).</p></section>

<section class="carte"><h2>Ajouter des codes</h2>
<form method="post" action="/admin/stock/ajouter">${csrf}
<label>Produit <select name="produit" required>${options}</select></label>
<label>Valeur (€) <input name="valeur" type="number" min="1" step="0.01" placeholder="ex. 50 — vide pour un pack ou un abonnement"></label>
<label>Codes (un par ligne) <textarea name="codes" rows="5" required autocomplete="off" spellcheck="false"></textarea></label>
<button>Ajouter au stock</button></form></section>

<section class="carte"><h2>Codes</h2>
<form method="get" class="filtres"><select name="produit"><option value="">Tous les produits</option>${options}</select>
<select name="statut"><option value="">Tous les statuts</option>${['disponible', 'reserve', 'vendu'].map((s) => `<option${filtre.statut === s ? ' selected' : ''}>${s}</option>`).join('')}</select><button>Filtrer</button></form>
<div class="defile"><table><thead><tr><th>Produit</th><th>Valeur</th><th>Code</th><th>Statut</th><th>ID de transaction</th><th>Date de vente</th><th></th></tr></thead><tbody>
${lignes.map((l) => `<tr>
<td>${esc(config.produits[l.produit]?.nom || l.produit)}</td>
<td>${l.statut === 'disponible' ? `<form method="post" action="/admin/stock/${l.id}/valeur" class="enligne">${csrf}<input name="valeur" type="number" min="1" step="0.01" value="${l.valeur_cents ? l.valeur_cents / 100 : ''}" placeholder="à renseigner"><button>OK</button></form>` : esc(euros(l.valeur_cents))}</td>
<td><details><summary>${esc(masque(l.code))}</summary><code>${esc(l.code)}</code></details></td>
<td><span class="statut ${l.statut}">${l.statut}</span></td>
<td>${esc(l.transaction_id || '')}</td><td>${esc(l.date_vente || '')}</td>
<td>${l.statut === 'disponible' ? `<form method="post" action="/admin/stock/${l.id}/supprimer" class="enligne">${csrf}<button class="danger" title="Supprimer ce code">✕</button></form>` : ''}</td>
</tr>`).join('') || '<tr><td colspan="7">Aucun code.</td></tr>'}
</tbody></table></div></section>`));
  });

  const versCents = (v) => {
    if (v === undefined || v === null || String(v).trim() === '') return null;
    const n = Math.round(Number(String(v).replace(',', '.')) * 100);
    if (!Number.isInteger(n) || n <= 0) throw new Error('Valeur invalide.');
    return n;
  };

  r.post('/stock/ajouter', (req, res) => {
    try {
      const codes = String(req.body.codes || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      const { ajoutes, doublons } = stock.ajouterCodes(db, getConfig(), { produit: req.body.produit, valeurCents: versCents(req.body.valeur), codes });
      res.redirect(303, `/admin?msg=${encodeURIComponent(`${ajoutes} code(s) ajouté(s)${doublons ? `, ${doublons} doublon(s) ignoré(s)` : ''}.`)}`);
    } catch (e) { res.redirect(303, `/admin?msg=${encodeURIComponent('Erreur : ' + e.message)}`); }
  });

  r.post('/stock/:id/valeur', (req, res) => {
    try {
      const n = stock.modifierValeur(db, Number(req.params.id), versCents(req.body.valeur));
      res.redirect(303, `/admin?msg=${encodeURIComponent(n ? 'Valeur enregistrée.' : 'Code introuvable ou déjà vendu.')}`);
    } catch (e) { res.redirect(303, `/admin?msg=${encodeURIComponent('Erreur : ' + e.message)}`); }
  });

  r.post('/stock/:id/supprimer', (req, res) => {
    const n = stock.supprimerCode(db, Number(req.params.id));
    res.redirect(303, `/admin?msg=${encodeURIComponent(n ? 'Code supprimé.' : 'Impossible : code déjà réservé ou vendu.')}`);
  });

  r.get('/diagnostic', async (req, res) => {
    const d = req.query.relancer || !diagnostic().verifie ? await diagnostiquer() : diagnostic();
    const ligne = (titre, x) => `<tr><td><b>${titre}</b></td><td><span class="statut ${x.ok ? 'livree' : 'a_rembourser'}">${x.ok ? 'OK' : 'À corriger'}</span></td><td>${esc(x.message)}</td></tr>`;
    const dispo = db.prepare("SELECT COUNT(*) n FROM stock WHERE statut = 'disponible'").get().n;
    res.send(page('Diagnostic', `<h1>Diagnostic de mise en ligne</h1>${req.query.msg ? `<p class="msg">${esc(req.query.msg)}</p>` : ''}
<section class="carte"><h2>Paiement et livraison</h2><div class="defile"><table><tbody>
${ligne('PayPal', d.paypal)}
<tr><td><b>Mode PayPal</b></td><td><span class="statut ${paypal.env === 'live' ? 'livree' : 'reserve'}">${paypal.env === 'live' ? 'RÉEL' : 'TEST'}</span></td><td>${paypal.env === 'live' ? 'Les paiements sont encaissés sur ton compte PayPal.' : 'Mode sandbox : aucun argent réel. Mets PAYPAL_ENV=live et tes clés live.'}</td></tr>
<tr><td><b>Webhook PayPal</b></td><td><span class="statut ${paypal.webhookConfigure() ? 'livree' : 'reserve'}">${paypal.webhookConfigure() ? 'OK' : 'Recommandé'}</span></td><td>${paypal.webhookConfigure() ? 'Identifiant configuré.' : 'PAYPAL_WEBHOOK_ID absent : confirmation de secours désactivée.'}</td></tr>
${ligne('E-mail (Brevo)', d.smtp)}
<tr><td><b>Codes en stock</b></td><td><span class="statut ${dispo ? 'livree' : 'a_rembourser'}">${dispo}</span></td><td>Codes disponibles (toutes boutiques).</td></tr>
</tbody></table></div>
${d.alertes.length ? `<ul class="alerte">${d.alertes.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : '<p class="aide">Aucune alerte.</p>'}
<p class="aide">Vérifié le ${esc(d.verifie)} · <a href="/admin/diagnostic?relancer=1">Relancer la vérification</a></p></section>
<section class="carte"><h2>Envoyer un e-mail de test</h2>
<form method="post" action="/admin/diagnostic/email">${csrf}<label>Adresse <input name="email" type="email" required value="${esc(process.env.ADMIN_EMAIL || (newsletter ? newsletter.destination() : ''))}"></label><button>Envoyer</button></form>
<p class="aide">Si le message n'arrive pas : vérifie les courriers indésirables, que MAIL_FROM est validé dans Brevo (Expéditeurs & domaines), et BREVO_API_KEY (clé API xkeysib-…). Le message d'erreur exact s'affiche en haut de cette page et dans les journaux.</p></section>`));
  });

  r.post('/diagnostic/email', async (req, res) => {
    try { await mailer.envoyerTest(String(req.body.email || '')); res.redirect(303, `/admin/diagnostic?msg=${encodeURIComponent('E-mail de test envoyé à ' + req.body.email)}`); }
    catch (e) { res.redirect(303, `/admin/diagnostic?msg=${encodeURIComponent('Échec de l’envoi : ' + e.message)}`); }
  });

  r.get('/commandes', (req, res) => {
    const config = getConfig();
    const rows = db.prepare('SELECT * FROM commandes ORDER BY cree_le DESC LIMIT 300').all();
    res.send(page('Commandes', `<h1>Commandes</h1>${req.query.msg ? `<p class="msg">${esc(req.query.msg)}</p>` : ''}
<section class="carte"><div class="defile"><table><thead><tr><th>N°</th><th>Date</th><th>E-mail</th><th>Articles</th><th>Total</th><th>Statut</th><th>PayPal</th><th>Remarque</th><th></th></tr></thead><tbody>
${rows.map((c) => `<tr><td>${esc(c.numero)}</td><td>${esc(c.cree_le)}</td><td>${esc(c.email)}</td>
<td>${JSON.parse(c.lignes).map((l) => `${l.quantite} × ${esc(config.produits[l.produit]?.nom || l.produit)} (${esc(l.libelleValeur)})`).join('<br>')}</td>
<td>${euros(c.total_cents)}</td><td><span class="statut ${c.statut}">${esc(c.statut)}</span></td>
<td>${esc(c.paypal_capture_id || c.paypal_order_id || '')}</td><td class="${c.erreur ? 'alerte' : ''}">${esc(c.erreur || '')}</td>
<td>${['payee', 'livree'].includes(c.statut) ? `<form method="post" action="/admin/commandes/${esc(c.numero)}/renvoyer" class="enligne">${csrf}<button>Renvoyer l'e-mail</button></form>` : ''}</td></tr>`).join('') || '<tr><td colspan="9">Aucune commande.</td></tr>'}
</tbody></table></div></section>`));
  });

  r.get('/newsletter', (req, res) => {
    const rows = newsletter ? newsletter.liste(500) : [];
    const brevo = process.env.BREVO_API_KEY && process.env.BREVO_LIST_ID ? `synchronisés avec ta liste Brevo n° ${esc(process.env.BREVO_LIST_ID)}` : 'non synchronisés avec Brevo (ajoute BREVO_API_KEY et BREVO_LIST_ID pour le faire automatiquement)';
    res.send(page('Newsletter', `<h1>Newsletter</h1>
<p class="aide"><b>${newsletter ? newsletter.compte() : 0}</b> abonné(s) actif(s), ${brevo}. Chaque inscription est aussi envoyée par e-mail à <b>${esc(newsletter ? newsletter.destination() : '')}</b>. <a href="/admin/newsletter.csv">Télécharger la liste (CSV)</a></p>
<section class="carte"><div class="defile"><table><thead><tr><th>Date</th><th>Prénom</th><th>Nom</th><th>E-mail</th><th>Téléphone</th><th>Depuis</th><th>Statut</th></tr></thead><tbody>
${rows.map((a) => `<tr><td>${esc(a.cree_le)}</td><td>${esc(a.prenom)}</td><td>${esc(a.nom)}</td><td>${esc(a.email)}</td><td>${esc(a.telephone || '')}</td><td>${esc(a.source || '')}</td>
<td>${a.desinscrit_le ? `<span class="statut annulee">désinscrit le ${esc(a.desinscrit_le)}</span>` : '<span class="statut livree">inscrit</span>'}</td></tr>`).join('') || '<tr><td colspan="7">Aucun abonné pour le moment.</td></tr>'}
</tbody></table></div></section>`));
  });
  r.get('/newsletter.csv', (req, res) => {
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="newsletter-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send('\ufeff' + (newsletter ? newsletter.csv() : ''));
  });

  r.post('/commandes/:numero/renvoyer', async (req, res) => {
    const c = await commandes.envoyerEmail(String(req.params.numero));
    res.redirect(303, `/admin/commandes?msg=${encodeURIComponent(c && c.statut === 'livree' && !c.erreur ? 'E-mail renvoyé.' : 'Échec de l’envoi : ' + (c?.erreur || 'commande introuvable'))}`);
  });

  return r;
}

module.exports = { routeurAdmin };
