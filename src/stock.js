'use strict';
/**
 * Stock de codes COMMUN aux 3 boutiques (un même article = un même stock).
 * - Codes chiffrés au repos (AES-256-GCM, clé CLE_CHIFFREMENT_CODES).
 * - Attribution atomique : une ligne de stock ne peut passer à « reserve »
 *   qu'une seule fois (UPDATE ... WHERE statut = 'disponible'), dans une
 *   transaction exclusive. Deux paiements simultanés ne reçoivent jamais
 *   le même code.
 * - Correspondance : cartes = produit + valeur exacte ; packs et abonnements
 *   = produit (valeur fixe).
 */
const crypto = require('crypto');
const { transaction } = require('./db');

class ErreurStock extends Error {
  constructor(produit, message) { super(message); this.produit = produit; this.code = 'STOCK'; }
}

function lireCle() {
  const hex = process.env.CLE_CHIFFREMENT_CODES || '';
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('CLE_CHIFFREMENT_CODES manquante ou invalide (64 caractères hexadécimaux). Lance : npm run generer-cle');
  }
  return Buffer.from(hex, 'hex');
}

const normaliser = (code) => String(code).trim().toUpperCase();

function chiffrer(cle, texte) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', cle, iv);
  const data = Buffer.concat([c.update(texte, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}

function dechiffrer(cle, paquet) {
  const [iv, tag, data] = paquet.split('.').map((s) => Buffer.from(s, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', cle, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString('utf8');
}

const empreinte = (cle, produit, code) =>
  crypto.createHmac('sha256', cle).update(`${produit}:${normaliser(code)}`).digest('hex');

/* ------------------------------------------------------------------ */

function ajouterCodes(db, config, { produit, valeurCents = null, codes }) {
  const p = config.produits[produit];
  if (!p) throw new Error(`Produit inconnu : ${produit}`);
  if (valeurCents !== null && !(Number.isInteger(valeurCents) && valeurCents > 0)) throw new Error('Valeur invalide.');
  const cle = lireCle();
  const ins = db.prepare(
    'INSERT OR IGNORE INTO stock (produit, valeur_cents, code_chiffre, code_empreinte) VALUES (?, ?, ?, ?)'
  );
  let ajoutes = 0;
  let doublons = 0;
  transaction(db, () => {
    for (const brut of codes) {
      const code = normaliser(brut);
      if (!code) continue;
      if (code.length > 200) throw new Error('Code trop long.');
      const r = ins.run(produit, valeurCents, chiffrer(cle, code), empreinte(cle, produit, code));
      if (r.changes) ajoutes++; else doublons++;
    }
  });
  return { ajoutes, doublons };
}

function critere(config, produit, valeurCents) {
  const p = config.produits[produit];
  if (p.type === 'carte') return { sql: 'produit = ? AND valeur_cents = ?', params: [produit, valeurCents] };
  return { sql: 'produit = ?', params: [produit] };
}

function estDisponible(db, config, produit, valeurCents, quantite = 1) {
  if (!config.produits[produit]) return false;
  const { sql, params } = critere(config, produit, valeurCents);
  const r = db.prepare(`SELECT COUNT(*) AS n FROM stock WHERE statut = 'disponible' AND ${sql}`).get(...params);
  return r.n >= quantite;
}

/** { produitId: true/false } — au moins un code vendable (carte : valeur renseignée). */
function disponibilitesParProduit(db, config) {
  const rows = db.prepare(`
    SELECT produit, SUM(CASE WHEN valeur_cents IS NOT NULL THEN 1 ELSE 0 END) AS avecValeur, COUNT(*) AS total
    FROM stock WHERE statut = 'disponible' GROUP BY produit`).all();
  const res = {};
  for (const id of Object.keys(config.produits)) res[id] = false;
  for (const r of rows) {
    const p = config.produits[r.produit];
    if (!p) continue;
    const prixOk = p.type === 'carte' || (p.prix !== null && p.prix !== undefined);
    res[r.produit] = prixOk && (p.type === 'carte' ? r.avecValeur > 0 : r.total > 0);
  }
  return res;
}

/**
 * Réserve un code par carte achetée, pour la commande `numero`.
 * Tout ou rien : si un seul article manque, rien n'est réservé.
 */
function reserver(db, config, numero, lignes) {
  return transaction(db, () => {
    const ids = [];
    for (const l of lignes) {
      const { sql, params } = critere(config, l.produit, l.valeurCents);
      const maj = db.prepare(`
        UPDATE stock SET statut = 'reserve', transaction_id = ?, reserve_le = datetime('now')
        WHERE id = (SELECT id FROM stock WHERE statut = 'disponible' AND ${sql} ORDER BY id LIMIT 1)
          AND statut = 'disponible'
        RETURNING id`);
      for (let i = 0; i < l.quantite; i++) {
        const r = maj.get(numero, ...params);
        if (!r) throw new ErreurStock(l.produit, `No more codes available for ${config.produits[l.produit].nom} (${l.libelleValeur}).`);
        ids.push(r.id);
      }
    }
    return ids;
  });
}

function nbReserves(db, numero) {
  return db.prepare("SELECT COUNT(*) AS n FROM stock WHERE transaction_id = ? AND statut = 'reserve'").get(numero).n;
}

/** Paiement confirmé : réservé → VENDU (date de vente). */
function confirmerVente(db, numero) {
  return db.prepare(`UPDATE stock SET statut = 'vendu', date_vente = datetime('now')
                     WHERE transaction_id = ? AND statut = 'reserve'`).run(numero).changes;
}

/** Paiement non abouti : les codes réservés redeviennent disponibles. */
function liberer(db, numero) {
  return db.prepare(`UPDATE stock SET statut = 'disponible', transaction_id = NULL, reserve_le = NULL
                     WHERE transaction_id = ? AND statut = 'reserve'`).run(numero).changes;
}

/** Libère les réservations abandonnées (commande jamais payée). */
function libererReservationsExpirees(db, minutes = 15) {
  return db.prepare(`
    UPDATE stock SET statut = 'disponible', transaction_id = NULL, reserve_le = NULL
    WHERE statut = 'reserve' AND reserve_le < datetime('now', ?)
      AND transaction_id IN (SELECT numero FROM commandes WHERE statut IN ('creee', 'annulee'))`)
    .run(`-${Number(minutes)} minutes`).changes;
}

/** Codes VENDUS d'une commande, déchiffrés — utilisé UNIQUEMENT pour l'e-mail de livraison. */
function codesVendus(db, numero) {
  const cle = lireCle();
  return db.prepare(`SELECT produit, valeur_cents, code_chiffre FROM stock
                     WHERE transaction_id = ? AND statut = 'vendu' ORDER BY id`).all(numero)
    .map((r) => ({ produit: r.produit, valeurCents: r.valeur_cents, code: dechiffrer(cle, r.code_chiffre) }));
}

/* ---------------------------- Administration ---------------------------- */

function listerStock(db, { produit, statut, limite = 500 } = {}) {
  const cle = lireCle();
  const where = [];
  const params = [];
  if (produit) { where.push('produit = ?'); params.push(produit); }
  if (statut) { where.push('statut = ?'); params.push(statut); }
  const sql = `SELECT * FROM stock ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT ?`;
  return db.prepare(sql).all(...params, limite).map((r) => ({ ...r, code: dechiffrer(cle, r.code_chiffre) }));
}

function modifierValeur(db, id, valeurCents) {
  if (valeurCents !== null && !(Number.isInteger(valeurCents) && valeurCents > 0)) throw new Error('Valeur invalide.');
  return db.prepare("UPDATE stock SET valeur_cents = ? WHERE id = ? AND statut = 'disponible'").run(valeurCents, id).changes;
}

function supprimerCode(db, id) {
  return db.prepare("DELETE FROM stock WHERE id = ? AND statut = 'disponible'").run(id).changes;
}

/* ---------------------- Import d'un fichier CSV ---------------------- */

/**
 * Lit un CSV « produit;valeur;code » (valeur en euros) et ajoute les codes. Ne renvoie jamais de code.
 * Tolérant : séparateur ; , ou tabulation (fichiers enregistrés par Excel), guillemets, « 50 € », majuscules,
 * espaces, BOM, fins de ligne Windows.
 */
function importerCsv(db, config, texte) {
  const lignes = String(texte).replace(/^\uFEFF/, '').split(/\r?\n|\r/);
  const ids = Object.keys(config.produits);
  const trouverProduit = (brut) => {
    const p = brut.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s_]+/g, '-');
    return ids.find((id) => id === p) || ids.find((id) => id.replace(/-/g, '') === p.replace(/-/g, '')) || null;
  };
  let ajoutes = 0; let doublons = 0; const erreurs = [];
  // Gros fichiers (des milliers de codes) : les lignes valides sont regroupées par produit + valeur et
  // enregistrées par paquets, au lieu d'une écriture disque par ligne (démarrage beaucoup plus rapide).
  const groupes = new Map();
  lignes.forEach((brut, i) => {
    const l = brut.trim();
    if (!l || l.startsWith('#')) return;
    const sep = l.includes(';') ? ';' : l.includes('\t') ? '\t' : ',';
    const [prodBrut = '', valBrut = '', ...reste] = l.split(sep).map((x) => x.trim().replace(/^"(.*)"$/, '$1').trim());
    const code = reste.join(sep).trim();
    if (/^(produit|product)$/i.test(prodBrut)) return; // en-tête
    const produit = trouverProduit(prodBrut);
    if (!produit) { erreurs.push(`ligne ${i + 1} : produit "${prodBrut.slice(0, 40)}" inconnu (attendu par ex. steam, netflix, pack-famille)`); return; }
    if (!code) { erreurs.push(`ligne ${i + 1} : code vide (format attendu : produit;valeur;code)`); return; }
    const valeur = valBrut.replace(/[^\d.,]/g, '');
    const valeurCents = valeur ? Math.round(Number(valeur.replace(',', '.')) * 100) : null;
    if (valeur && !(valeurCents > 0)) { erreurs.push(`ligne ${i + 1} : valeur "${valBrut}" invalide`); return; }
    if (normaliser(code).length > 200) { erreurs.push(`ligne ${i + 1} : code trop long`); return; }
    const cleGroupe = `${produit}|${valeurCents}`;
    if (!groupes.has(cleGroupe)) groupes.set(cleGroupe, { produit, valeurCents, codes: [] });
    groupes.get(cleGroupe).codes.push(code);
  });
  for (const g of groupes.values()) {
    const r = ajouterCodes(db, config, g);
    ajoutes += r.ajoutes; doublons += r.doublons;
  }
  return { ajoutes, doublons, erreurs };
}

/** Fichier de stock à charger au démarrage : STOCK_CSV, Secret File Render (même mal nommé), racine, private/. */
function fichierStockAuto() {
  const fs = require('fs'); const path = require('path');
  const racine = path.join(__dirname, '..');
  const existe = (f) => { try { return fs.statSync(f).isFile(); } catch { return false; } };
  const candidats = [process.env.STOCK_CSV, '/etc/secrets/stock-initial.csv', path.join(racine, 'stock-initial.csv'), path.join(racine, 'private', 'stock-initial.csv')].filter(Boolean);
  const trouve = candidats.find(existe);
  if (trouve) return trouve;
  // Secret File nommé autrement (« stock », « stock-initial », « stock.csv »…)
  try {
    const nom = fs.readdirSync('/etc/secrets').find((n) => /stock/i.test(n) && existe(path.join('/etc/secrets', n)));
    if (nom) return path.join('/etc/secrets', nom);
  } catch { /* pas de dossier /etc/secrets */ }
  return null;
}

/** Contenu de la variable STOCK_CODES (si le stock a été collé comme variable d'environnement). */
function stockDepuisVariable() {
  const v = process.env.STOCK_CODES;
  if (!v || !v.trim()) return null;
  // Une ligne par code ; si tout est sur une seule ligne, les entrées peuvent être séparées par des espaces ou « | »
  return v.includes('\n') ? v : v.split(/[\s|]+/).join('\n');
}

/** Noms (jamais le contenu) des Secret Files présents, pour le diagnostic. */
function secretsPresents() {
  try { return require('fs').readdirSync('/etc/secrets'); } catch { return []; }
}

/**
 * Au démarrage : si la base n'a encore AUCUN code, charge le stock (fichier ou variable STOCK_CODES).
 * (Base déjà remplie = rien à faire : les codes vendus ou supprimés ne reviennent pas.
 *  STOCK_IMPORT=toujours relit la source à chaque démarrage ; les doublons sont ignorés.)
 */
function importAuDemarrage(db, config, journal = console) {
  const total = db.prepare('SELECT COUNT(*) AS n FROM stock').get().n;
  const forcer = String(process.env.STOCK_IMPORT || '').toLowerCase() === 'toujours';
  if (total > 0 && !forcer) return { fait: false, raison: 'base déjà remplie' };
  const fichier = fichierStockAuto();
  const variable = fichier ? null : stockDepuisVariable();
  if (!fichier && !variable) {
    const s = secretsPresents();
    return { fait: false, raison: `aucun fichier de stock trouvé. Secret Files présents : ${s.length ? s.join(', ') : 'aucun'}` };
  }
  const source = fichier || 'variable STOCK_CODES';
  try {
    const r = importerCsv(db, config, fichier ? require('fs').readFileSync(fichier, 'utf8') : variable);
    journal.log(`  ${r.ajoutes ? '✓' : '✗'} Stock lu depuis ${source} : ${r.ajoutes} code(s) ajouté(s), ${r.doublons} déjà présent(s), ${r.erreurs.length} ligne(s) ignorée(s).`);
    for (const e of r.erreurs) journal.warn(`  ⚠ Stock : ${e}`);
    return { fait: r.ajoutes > 0, fichier: source, ...r, raison: r.ajoutes ? '' : `${source} lu, mais aucune ligne valide (${r.erreurs[0] || 'fichier vide'})` };
  } catch (e) {
    journal.error(`  ✗ Stock non chargé (${source}) : ${e.message}`);
    return { fait: false, raison: `${source} : ${e.message}` };
  }
}

/** Nombre de codes disponibles (tous articles confondus). */
function nbDisponibles(db) {
  return db.prepare("SELECT COUNT(*) AS n FROM stock WHERE statut = 'disponible'").get().n;
}

module.exports = {
  importerCsv, fichierStockAuto, importAuDemarrage, nbDisponibles,
  ErreurStock, lireCle, ajouterCodes, estDisponible, disponibilitesParProduit,
  reserver, nbReserves, confirmerVente, liberer, libererReservationsExpirees, codesVendus,
  listerStock, modifierValeur, supprimerCode,
};
