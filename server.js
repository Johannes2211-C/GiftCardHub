'use strict';
/**
 * ============================================================
 *  Boutique de cartes cadeaux numériques — serveur principal
 * ============================================================
 *  - Express : pages (3D + mode simple), API panier / paiement
 *  - PayPal (Orders v2) : création + capture CÔTÉ SERVEUR, webhook signé
 *  - Brevo (API HTTP, ou SMTP en secours) : e-mail de livraison automatique du code
 *  - Stock commun aux 3 boutiques, attribution atomique, codes chiffrés
 *
 *  Toutes les clés viennent de process.env (voir .env.example).
 * ============================================================
 */
require('dotenv').config();
require('./src/env').nettoyerEnv(); // espaces / guillemets parasites autour des clés collées

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { rateLimit } = require('express-rate-limit');

const { chargerConfig, cataloguePublic, prixLigne } = require('./src/catalogue');
const { ouvrirBase } = require('./src/db');
const stock = require('./src/stock');
const { creerClientPayPal } = require('./src/paypal');
const { creerMailer } = require('./src/mailer');
const { creerServiceCommandes, ErreurClient } = require('./src/commandes');
const pages = require('./src/pages');
const { routeurAdmin } = require('./src/admin');
const { creerServiceNewsletter } = require('./src/newsletter');

/* ------------------------------ Démarrage ------------------------------ */

const PROD = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT || 3000);
const SITE_URL = (process.env.SITE_URL || `http://localhost:${PORT}`).replace(/\/+$/, '');

let config = chargerConfig();                // échoue avec un message clair si la config est invalide
stock.lireCle();                             // échoue si CLE_CHIFFREMENT_CODES est absente
if (PROD && !SITE_URL.startsWith('https://')) {
  console.warn('⚠ SITE_URL doit commencer par https:// en production (balises og:image absolues).');
}

const db = ouvrirBase(process.env.DB_PATH || path.join(__dirname, 'data', 'boutique.sqlite'));
const paypal = creerClientPayPal();
const mailer = creerMailer();
const commandes = creerServiceCommandes({ db, config: () => config, paypal, mailer });
const newsletter = creerServiceNewsletter({ db, config: () => config, mailer, cle: stock.lireCle(), siteUrl: SITE_URL });

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1)); // Render / hPanel sont derrière un proxy

/* ------------------------------ Sécurité ------------------------------ */

if (process.env.FORCE_HTTPS === 'true') {
  app.use((req, res, next) => {
    if (req.secure) return next();
    return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
  });
}

const PAYPAL_DOMAINES = ['https://www.paypal.com', 'https://*.paypal.com', 'https://*.paypalobjects.com'];
const ancetres = (process.env.FRAME_ANCESTORS || '').split(/[\s,]+/).filter(Boolean); // ex. https://monsite-wordpress.fr

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'", ...PAYPAL_DOMAINES, 'https://cdn.jsdelivr.net'],
      'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
      'img-src': ["'self'", 'data:', 'blob:', ...PAYPAL_DOMAINES],
      'connect-src': ["'self'", ...PAYPAL_DOMAINES, 'https://cdn.jsdelivr.net'],
      'frame-src': PAYPAL_DOMAINES,
      'frame-ancestors': ["'self'", ...ancetres],
      'form-action': ["'self'"],
      'upgrade-insecure-requests': PROD ? [] : null,
    },
  },
  frameguard: false,                                     // remplacé par frame-ancestors (intégration WordPress)
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // images utilisables par le bloc intégré / og:image
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }, // fenêtre PayPal
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

// CORS : uniquement pour l'API et uniquement depuis les domaines autorisés (bloc de paiement sur WordPress)
const origines = (process.env.ALLOWED_ORIGINS || '').split(/[\s,]+/).filter(Boolean);
const corsApi = cors({
  origin(origin, cb) { cb(null, !origin || origines.includes(origin) || origin === SITE_URL); },
  methods: ['GET', 'POST'],
  maxAge: 600,
});

const limiteur = (max, minutes) => rateLimit({
  windowMs: minutes * 60_000, limit: max, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { erreur: 'Too many attempts. Wait a minute and try again.' },
});

/* --------------------------- Webhook PayPal --------------------------- */
// Corps BRUT obligatoire pour vérifier la signature : déclaré AVANT express.json().
app.post('/api/paypal/webhook', express.raw({ type: '*/*', limit: '200kb' }), async (req, res) => {
  const brut = req.body instanceof Buffer ? req.body.toString('utf8') : '';
  try {
    const ok = await paypal.verifierWebhook(req.headers, brut);
    if (!ok) return res.status(400).json({ erreur: 'invalid signature' });
    const resultat = await commandes.traiterWebhook(JSON.parse(brut));
    return res.json({ ok: true, resultat });
  } catch (e) {
    console.error('[webhook]', e.message);
    return res.status(500).json({ erreur: 'processing failed' }); // PayPal renverra l'événement
  }
});

app.use('/api', corsApi);
app.use(express.json({ limit: '20kb' }));
app.use(express.urlencoded({ extended: false, limit: '200kb' }));

/* ------------------------------ API ------------------------------ */

const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

app.get('/api/sante', (req, res) => res.json({ ok: true, paypal: paypal.configure() ? paypal.env : 'non configuré' }));

// Catalogue public : produits, prix (depuis la config), disponibilité oui/non. Aucun code, aucun nombre de codes.
app.get('/api/catalogue', limiteur(300, 5), (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(cataloguePublic(config, {
    disponibilites: stock.disponibilitesParProduit(db, config),
    paypalClientId: process.env.PAYPAL_CLIENT_ID || '',
  }));
});

// Disponibilité pour un montant et une quantité précis : oui / non seulement
// (jamais le nombre de codes en stock).
app.get('/api/disponibilite', limiteur(120, 1), (req, res) => {
  const produit = String(req.query.produit || '');
  const p = config.produits[produit];
  if (!p) return res.status(404).json({ disponible: false });
  const prix = prixLigne(config, produit, req.query.montant);
  if (!prix.ok) return res.json({ disponible: false, message: prix.message });
  res.set('Cache-Control', 'no-store');
  const qMax = (config.experience && config.experience.quantiteMax) || 10;
  const quantite = Math.min(qMax, Math.max(1, parseInt(req.query.quantite, 10) || 1));
  return res.json({ disponible: stock.estDisponible(db, config, produit, prix.valeurCents, quantite) });
});

// Étape 1 du paiement : le serveur calcule le total et crée la commande PayPal.
app.post('/api/commandes', limiteur(20, 10), asyncRoute(async (req, res) => {
  const { email, lignes, consentement } = req.body || {};
  const r = await commandes.creerCommande(email, lignes, consentement);
  res.status(201).json({ id: r.orderId, numero: r.numero });
}));

// Étape 2 : capture serveur → PayPal, puis attribution des codes et e-mail.
app.post('/api/commandes/:orderId/capture', limiteur(30, 10), asyncRoute(async (req, res) => {
  const orderId = String(req.params.orderId);
  if (!/^[A-Z0-9-]{5,40}$/i.test(orderId)) throw new ErreurClient('Invalid payment reference.');
  res.json(await commandes.capturer(orderId));
}));

// Newsletter : inscription depuis l'hologramme du comptoir (3D) ou le bandeau (page normale)
app.post('/api/newsletter', limiteur(20, 15), asyncRoute(async (req, res) => {
  const b = req.body || {};
  const r = await newsletter.inscrire(
    { prenom: b.prenom, nom: b.nom, telephone: b.telephone, email: b.email, consentement: b.consentement, site: b.site },
    { source: ['3d', 'simple', 'bloc'].includes(b.source) ? b.source : 'site' },
  );
  res.status(r.nouveau ? 201 : 200).json({ ok: true, deja: !r.nouveau && !r.ignore, prenom: r.prenom || '' });
}));
app.get('/newsletter/unsubscribe', limiteur(30, 10), (req, res) => {
  const ok = newsletter.desinscrire(req.query.e, String(req.query.t || ''));
  res.status(ok ? 200 : 400).send(pages.pageSimple(ctx(), ok
    ? { titre: 'You’ve been unsubscribed', texte: 'You won’t receive our newsletter any more. You can sign up again at any time from the store.' }
    : { titre: 'Link not valid', texte: 'This unsubscribe link is incomplete or has expired. Contact customer service and we’ll take you off the list.' }));
});

/* ------------------------------ Fichiers ------------------------------ */

const statique = (dossier, maxAge) => express.static(path.join(__dirname, dossier), { maxAge, fallthrough: true, index: false });
app.use('/img', statique('public/img', '30d'));
app.use('/css', statique('public/css', PROD ? '1h' : 0));
app.use('/js', statique('public/js', PROD ? '1h' : 0));
app.use('/embed', statique('public/embed', PROD ? '1h' : 0));
app.use('/vendor/three', express.static(path.join(__dirname, 'node_modules', 'three', 'build'), { maxAge: '30d', index: false }));
app.get('/favicon.ico', (req, res) => res.redirect(301, '/img/favicon.svg'));

/* ------------------------------ Admin ------------------------------ */

app.use('/admin', limiteur(200, 15), routeurAdmin({ db, config: () => config, commandes, newsletter, express, diagnostiquer: () => diagnostiquer(), diagnostic: () => diagnostic, mailer, paypal }));

/* ------------------------------ Pages ------------------------------ */

const ctx = () => ({ config, siteUrl: SITE_URL, disponibilites: stock.disponibilitesParProduit(db, config) });

app.get('/', (req, res) => res.send(pages.pageBoutique(ctx(), { slug: null, chemin: '/' })));
app.get('/help', (req, res) => res.send(pages.pageAide(ctx())));
// Anciennes adresses (version française) → nouvelles adresses en anglais (redirection permanente)
const ANCIENS_SLUGS = { generale: 'general', noel: 'christmas' };
app.get('/aide', (req, res) => res.redirect(301, '/help'));
const redirigerAncienne = (req, res) => {
  const slug = ANCIENS_SLUGS[req.params.slug] || req.params.slug;
  res.redirect(301, `/shop/${encodeURIComponent(slug)}${req.params.produit ? `/${encodeURIComponent(req.params.produit)}` : ''}`);
};
app.get('/boutique/:slug', redirigerAncienne);
app.get('/boutique/:slug/:produit', redirigerAncienne);
app.get('/shop/:slug', (req, res, next) => {
  const b = config.boutiques[req.params.slug];
  if (!b || !b.actif) return next();
  return res.send(pages.pageBoutique(ctx(), { slug: b.slug, chemin: req.path }));
});
app.get('/shop/:slug/:produit', (req, res, next) => {
  const b = config.boutiques[req.params.slug];
  if (!b || !b.actif) return next();
  const vendu = b.sections.some((s) => s.produits.includes(req.params.produit));
  if (!vendu) return next();
  return res.send(pages.pageBoutique(ctx(), { slug: b.slug, produit: req.params.produit, chemin: req.path }));
});

app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ erreur: 'Not found' });
  return res.status(404).send(pages.page404(ctx()));
});

// Erreurs : messages clairs pour le client, détails seulement dans les journaux.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof ErreurClient) {
    return res.status(err.status).json({ erreur: err.message, produit: err.produit, relancer: err.relancer });
  }
  if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') {
    return res.status(400).json({ erreur: 'Invalid request.' });
  }
  console.error('[erreur]', err);
  return res.status(500).json({ erreur: 'A technical problem occurred. You have not been charged. Please try again in a moment.' });
});

/* ------------------------------ Lancement ------------------------------ */

commandes.demarrerTachesDeFond();

// Stock : chargé automatiquement si la base est vide (Secret File Render « stock-initial.csv », STOCK_CSV ou private/)
const importStock = stock.importAuDemarrage(db, config);

/** Vérifie au démarrage que PayPal et Brevo répondent : les erreurs apparaissent dans les journaux et dans /admin/diagnostic. */
const diagnostic = { verifie: null, paypal: null, smtp: null, alertes: [] };
async function diagnostiquer() {
  const alertes = [];
  const dispo = stock.nbDisponibles(db);
  if (process.env.RENDER && mailer.mode === 'smtp') alertes.push('Render gratuit BLOQUE les ports SMTP (25/465/587) : aucun e-mail ne peut partir en SMTP. Renseigne BREVO_API_KEY (clé API xkeysib-…) pour envoyer par l’API HTTP de Brevo.');
  if (!process.env.CLE_CHIFFREMENT_CODES) alertes.push('CLE_CHIFFREMENT_CODES manquante : impossible de charger ou de livrer les codes.');
  if (dispo === 0) alertes.push(`STOCK VIDE : tous les articles s’affichent « Indisponible » et le paiement PayPal est bloqué. Raison : ${importStock.raison || 'tous les codes sont vendus'}. Ajoute le fichier stock-initial.csv en « Secret File » sur Render (Environment → Secret Files), ou saisis les codes dans /admin.`);
  if (PROD && paypal.env !== 'live') alertes.push('PAYPAL_ENV n’est pas « live » : les paiements sont des paiements de TEST.');
  if (!paypal.webhookConfigure()) alertes.push('PAYPAL_WEBHOOK_ID manquant : la livraison fonctionne (les paiements en attente sont revérifiés auprès de PayPal toutes les 2 minutes), mais sans la confirmation de secours immédiate de PayPal.');
  if (PROD && !SITE_URL.startsWith('https://')) alertes.push('SITE_URL doit commencer par https://.');
  if (process.env.RENDER && !(process.env.DB_PATH || '').startsWith('/var/data')) alertes.push('Render SANS disque persistant (offre gratuite) : la base repart de zéro à chaque mise en veille (15 min sans visite), redémarrage ou mise à jour. Le stock est rechargé depuis stock-initial.csv, donc un code DÉJÀ VENDU redevient disponible et pourrait être revendu, et l’historique des commandes est perdu. OK pour tester en sandbox ; pour vendre en réel : offre payante + disque monté sur /var/data et DB_PATH=/var/data/boutique.sqlite.');
  const [pp, mail] = await Promise.all([paypal.verifier(), mailer.verifier()]);
  Object.assign(diagnostic, { verifie: new Date().toISOString(), paypal: pp, smtp: mail, alertes });
  console.log(`  ${pp.ok ? '✓' : '✗'} PayPal : ${pp.message}`);
  console.log(`  ${mail.ok ? (mail.avertissement ? '⚠' : '✓') : '✗'} E-mail (${mailer.mode === 'api' ? 'API HTTP Brevo' : 'SMTP'}) : ${mail.message}`);
  if (!mail.ok) console.error(`[e-mail] ✗ AUCUN E-MAIL NE PARTIRA (livraisons, formulaire) tant que ceci n'est pas corrigé : ${mail.message}`);
  for (const a of alertes) console.warn(`  ⚠ ${a}`);
  return diagnostic;
}

const serveur = app.listen(PORT, () => {
  const compte = (s) => config.boutiques[s].sections.reduce((n, x) => n + x.produits.length, 0);
  console.log(`✓ Boutique en ligne sur ${SITE_URL} (port ${PORT})`);
  console.log(`  Articles : ${Object.keys(config.boutiques).map((s) => `${config.boutiques[s].nomCourt} ${compte(s)}`).join(' / ')}`);
  console.log(`  PayPal : ${paypal.configure() ? (paypal.env === 'live' ? 'mode RÉEL (live)' : 'mode TEST (sandbox)') : 'NON CONFIGURÉ'}`);
  console.log(`  Stock : ${stock.nbDisponibles(db)} code(s) disponible(s)`);
  console.log(`  Formulaire newsletter → ${newsletter.destination() || 'AUCUNE adresse (CONTACT_EMAIL)'}`);
  if (process.env.DIAGNOSTIC_DEMARRAGE !== 'non') diagnostiquer().catch((e) => console.error('Diagnostic :', e.message));
});

// Recharger la configuration sans redémarrer : kill -HUP <pid>
process.on('SIGHUP', () => {
  try { config = chargerConfig(); console.log('✓ Configuration rechargée'); } catch (e) { console.error(e.message); }
});
process.on('SIGTERM', () => serveur.close(() => process.exit(0)));

module.exports = app;
