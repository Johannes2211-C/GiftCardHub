'use strict';
/**
 * Base SQLite intégrée à Node (module node:sqlite, Node ≥ 22.13) :
 * aucune dépendance native à compiler sur Render ou hPanel.
 * Le fichier est créé automatiquement (DB_PATH, par défaut ./data/boutique.sqlite).
 */
const fs = require('fs');
const path = require('path');

// node:sqlite affiche un avertissement « expérimental » : on le filtre, le reste passe.
const emitWarning = process.emitWarning;
process.emitWarning = function (w, ...rest) {
  if (String(w && w.message ? w.message : w).includes('SQLite')) return;
  return emitWarning.call(process, w, ...rest);
};
const { DatabaseSync } = require('node:sqlite');

function ouvrirBase(fichier) {
  if (fichier !== ':memory:') fs.mkdirSync(path.dirname(fichier), { recursive: true });
  const db = new DatabaseSync(fichier);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    PRAGMA foreign_keys = ON;

    -- TABLE DE STOCK : Produit, Valeur, Code, Statut, ID de transaction, Date de vente
    CREATE TABLE IF NOT EXISTS stock (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      produit         TEXT    NOT NULL,
      valeur_cents    INTEGER,                 -- vide = à renseigner
      code_chiffre    TEXT    NOT NULL,        -- code chiffré (AES-256-GCM)
      code_empreinte  TEXT    NOT NULL UNIQUE, -- empêche les doublons sans stocker le code en clair
      statut          TEXT    NOT NULL DEFAULT 'disponible'
                      CHECK (statut IN ('disponible', 'reserve', 'vendu')),
      transaction_id  TEXT,
      date_vente      TEXT,
      reserve_le      TEXT,
      ajoute_le       TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_stock_dispo ON stock (produit, valeur_cents, statut);
    CREATE INDEX IF NOT EXISTS idx_stock_tx ON stock (transaction_id);

    CREATE TABLE IF NOT EXISTS commandes (
      numero            TEXT PRIMARY KEY,
      email             TEXT NOT NULL,
      lignes            TEXT NOT NULL,         -- JSON : [{produit, quantite, prixCents, valeurCents, libelleValeur}]
      total_cents       INTEGER NOT NULL,
      devise            TEXT NOT NULL,
      paypal_order_id   TEXT UNIQUE,
      paypal_capture_id TEXT,
      statut            TEXT NOT NULL DEFAULT 'creee'
                        CHECK (statut IN ('creee', 'en_attente', 'payee', 'livree', 'annulee', 'a_rembourser')),
      cree_le           TEXT NOT NULL DEFAULT (datetime('now')),
      payee_le          TEXT,
      email_envoye_le   TEXT,
      essais_email      INTEGER NOT NULL DEFAULT 0,
      erreur            TEXT
    );

    -- NEWSLETTER : abonnés (prénom, nom, téléphone, e-mail, date d'accord, désinscription)
    CREATE TABLE IF NOT EXISTS abonnes (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      email            TEXT NOT NULL UNIQUE,
      prenom           TEXT NOT NULL,
      nom              TEXT NOT NULL,
      telephone        TEXT,
      source           TEXT,
      consentement_le  TEXT NOT NULL,
      cree_le          TEXT NOT NULL DEFAULT (datetime('now')),
      desinscrit_le    TEXT
    );

    CREATE TABLE IF NOT EXISTS evenements_paypal (
      id       TEXT PRIMARY KEY,
      type     TEXT,
      recu_le  TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  // Migrations douces (bases créées par une version précédente)
  try { db.exec('ALTER TABLE commandes ADD COLUMN consentement_le TEXT'); } catch (_) { /* colonne déjà présente */ }
  return db;
}

/** Exécute fn() dans une transaction exclusive (verrou en écriture immédiat). */
function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch (_) { /* déjà annulée */ }
    throw e;
  }
}

module.exports = { ouvrirBase, transaction };
